// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32 } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract TeamSynergyFHE is SepoliaConfig {
    struct EncryptedMessage {
        uint256 id;
        euint32 encryptedPlayerId;
        euint32 encryptedMessage; 
        euint32 encryptedRole;
        uint256 timestamp;
    }

    struct DecryptedMessage {
        string playerId;
        string message;
        string role;
        bool isRevealed;
    }

    uint256 public messageCount;
    mapping(uint256 => EncryptedMessage) public encryptedMessages;
    mapping(uint256 => DecryptedMessage) public decryptedMessages;
    mapping(string => euint32) private encryptedRoleCount;
    string[] private roleList;
    mapping(uint256 => uint256) private requestToMessageId;

    event MessageSubmitted(uint256 indexed id, uint256 timestamp);
    event DecryptionRequested(uint256 indexed id);
    event MessageDecrypted(uint256 indexed id);

    modifier onlyTeam(uint256 messageId) {
        _;
    }

    function submitEncryptedMessage(
        euint32 encryptedPlayerId,
        euint32 encryptedMessageContent,
        euint32 encryptedRole
    ) public {
        messageCount += 1;
        uint256 newId = messageCount;
        
        encryptedMessages[newId] = EncryptedMessage({
            id: newId,
            encryptedPlayerId: encryptedPlayerId,
            encryptedMessage: encryptedMessageContent,
            encryptedRole: encryptedRole,
            timestamp: block.timestamp
        });

        decryptedMessages[newId] = DecryptedMessage({
            playerId: "",
            message: "",
            role: "",
            isRevealed: false
        });

        emit MessageSubmitted(newId, block.timestamp);
    }

    function requestMessageDecryption(uint256 messageId) public onlyTeam(messageId) {
        EncryptedMessage storage msgData = encryptedMessages[messageId];
        require(!decryptedMessages[messageId].isRevealed, "Already decrypted");

        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(msgData.encryptedPlayerId);
        ciphertexts[1] = FHE.toBytes32(msgData.encryptedMessage);
        ciphertexts[2] = FHE.toBytes32(msgData.encryptedRole);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptMessage.selector);
        requestToMessageId[reqId] = messageId;

        emit DecryptionRequested(messageId);
    }

    function decryptMessage(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 messageId = requestToMessageId[requestId];
        require(messageId != 0, "Invalid request");

        EncryptedMessage storage eMsg = encryptedMessages[messageId];
        DecryptedMessage storage dMsg = decryptedMessages[messageId];
        require(!dMsg.isRevealed, "Already decrypted");

        FHE.checkSignatures(requestId, cleartexts, proof);

        string[] memory results = abi.decode(cleartexts, (string[]));
        dMsg.playerId = results[0];
        dMsg.message = results[1];
        dMsg.role = results[2];
        dMsg.isRevealed = true;

        if (!FHE.isInitialized(encryptedRoleCount[dMsg.role])) {
            encryptedRoleCount[dMsg.role] = FHE.asEuint32(0);
            roleList.push(dMsg.role);
        }
        encryptedRoleCount[dMsg.role] = FHE.add(
            encryptedRoleCount[dMsg.role], 
            FHE.asEuint32(1)
        );

        emit MessageDecrypted(messageId);
    }

    function getDecryptedMessage(uint256 messageId) public view returns (
        string memory playerId,
        string memory message,
        string memory role,
        bool isRevealed
    ) {
        DecryptedMessage storage m = decryptedMessages[messageId];
        return (m.playerId, m.message, m.role, m.isRevealed);
    }

    function getEncryptedRoleCount(string memory role) public view returns (euint32) {
        return encryptedRoleCount[role];
    }

    function requestRoleCountDecryption(string memory role) public {
        euint32 count = encryptedRoleCount[role];
        require(FHE.isInitialized(count), "Role not found");

        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(count);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptRoleCount.selector);
        requestToMessageId[reqId] = bytes32ToUint(keccak256(abi.encodePacked(role)));
    }

    function decryptRoleCount(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 roleHash = requestToMessageId[requestId];
        string memory role = getRoleFromHash(roleHash);

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint32 count = abi.decode(cleartexts, (uint32));
    }

    function bytes32ToUint(bytes32 b) private pure returns (uint256) {
        return uint256(b);
    }

    function getRoleFromHash(uint256 hash) private view returns (string memory) {
        for (uint i = 0; i < roleList.length; i++) {
            if (bytes32ToUint(keccak256(abi.encodePacked(roleList[i]))) == hash) {
                return roleList[i];
            }
        }
        revert("Role not found");
    }
}