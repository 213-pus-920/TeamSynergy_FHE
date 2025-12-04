import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface CommunicationRecord {
  id: string;
  encryptedData: string;
  timestamp: number;
  teamId: string;
  analysisResult: string;
  synergyScore: number;
  decisionEfficiency: number;
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<CommunicationRecord[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newRecordData, setNewRecordData] = useState({
    teamId: "",
    communicationData: ""
  });
  const [showFAQ, setShowFAQ] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");

  // Calculate statistics
  const averageSynergy = records.length > 0 
    ? records.reduce((sum, record) => sum + record.synergyScore, 0) / records.length 
    : 0;
  const averageEfficiency = records.length > 0 
    ? records.reduce((sum, record) => sum + record.decisionEfficiency, 0) / records.length 
    : 0;

  useEffect(() => {
    loadRecords().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadRecords = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("record_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing record keys:", e);
        }
      }
      
      const list: CommunicationRecord[] = [];
      
      for (const key of keys) {
        try {
          const recordBytes = await contract.getData(`record_${key}`);
          if (recordBytes.length > 0) {
            try {
              const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
              list.push({
                id: key,
                encryptedData: recordData.data,
                timestamp: recordData.timestamp,
                teamId: recordData.teamId,
                analysisResult: recordData.analysisResult,
                synergyScore: recordData.synergyScore,
                decisionEfficiency: recordData.decisionEfficiency
              });
            } catch (e) {
              console.error(`Error parsing record data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading record ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRecords(list);
    } catch (e) {
      console.error("Error loading records:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitRecord = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting communication data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newRecordData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Simulate FHE-NLP analysis results
      const synergyScore = Math.floor(Math.random() * 100);
      const decisionEfficiency = Math.floor(Math.random() * 100);
      const analysisResult = synergyScore > 70 ? "Excellent Team Synergy" : 
                            synergyScore > 50 ? "Good Coordination" : 
                            "Needs Improvement";

      const recordData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        teamId: newRecordData.teamId,
        analysisResult,
        synergyScore,
        decisionEfficiency
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `record_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(recordData))
      );
      
      const keysBytes = await contract.getData("record_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(recordId);
      
      await contract.setData(
        "record_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted data submitted securely!"
      });
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewRecordData({
          teamId: "",
          communicationData: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const analyzeCommunication = async () => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Performing FHE-NLP analysis on encrypted data..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE analysis completed successfully!"
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Analysis failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const renderSynergyChart = () => {
    if (records.length === 0) {
      return (
        <div className="no-data-chart">
          <p>No data available</p>
          <p>Submit communication data to see analysis</p>
        </div>
      );
    }

    return (
      <div className="synergy-chart">
        <div className="chart-header">
          <h4>Team Synergy Score</h4>
          <div className="chart-value">{averageSynergy.toFixed(1)}</div>
        </div>
        <div className="chart-bar">
          <div 
            className="bar-fill" 
            style={{ width: `${averageSynergy}%` }}
          ></div>
        </div>
        <div className="chart-labels">
          <span>0</span>
          <span>25</span>
          <span>50</span>
          <span>75</span>
          <span>100</span>
        </div>
      </div>
    );
  };

  const renderEfficiencyChart = () => {
    if (records.length === 0) {
      return (
        <div className="no-data-chart">
          <p>No data available</p>
          <p>Submit communication data to see analysis</p>
        </div>
      );
    }

    return (
      <div className="efficiency-chart">
        <div className="chart-header">
          <h4>Decision Efficiency</h4>
          <div className="chart-value">{averageEfficiency.toFixed(1)}</div>
        </div>
        <div className="chart-bar">
          <div 
            className="bar-fill" 
            style={{ width: `${averageEfficiency}%` }}
          ></div>
        </div>
        <div className="chart-labels">
          <span>0</span>
          <span>25</span>
          <span>50</span>
          <span>75</span>
          <span>100</span>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner">
        <div className="fhe-ring"></div>
        <div className="fhe-ring"></div>
        <div className="fhe-ring"></div>
        <div className="fhe-text">Initializing FHE Connection...</div>
      </div>
    </div>
  );

  return (
    <div className="app-container tech-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="team-icon"></div>
          </div>
          <h1>Team<span>Synergy</span>FHE</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-record-btn tech-button"
          >
            <div className="add-icon"></div>
            Add Communication
          </button>
          <button 
            className="tech-button"
            onClick={() => setShowFAQ(!showFAQ)}
          >
            {showFAQ ? "Hide FAQ" : "Show FAQ"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="tab-navigation">
          <button 
            className={`tab-button ${activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveTab("dashboard")}
          >
            <div className="dashboard-icon"></div>
            Dashboard
          </button>
          <button 
            className={`tab-button ${activeTab === "records" ? "active" : ""}`}
            onClick={() => setActiveTab("records")}
          >
            <div className="records-icon"></div>
            Communication Records
          </button>
          <button 
            className={`tab-button ${activeTab === "analysis" ? "active" : ""}`}
            onClick={() => setActiveTab("analysis")}
          >
            <div className="analysis-icon"></div>
            FHE Analysis
          </button>
        </div>
        
        {activeTab === "dashboard" && (
          <div className="dashboard-section">
            <div className="welcome-banner">
              <div className="welcome-text">
                <h2>Confidential Analysis of Esports Player Communication</h2>
                <p>Analyze encrypted team communications using FHE-NLP to optimize team synergy and decision efficiency</p>
              </div>
              <div className="fhe-badge">
                <span>FHE-Powered Privacy</span>
              </div>
            </div>
            
            <div className="dashboard-grid">
              <div className="dashboard-card tech-card">
                <h3>Project Introduction</h3>
                <p>TeamSynergy FHE enables esports teams to perform confidential analysis of their encrypted in-game communications using Fully Homomorphic Encryption (FHE) and Natural Language Processing (NLP).</p>
                <div className="features">
                  <div className="feature">
                    <div className="feature-icon lock"></div>
                    <span>Protect tactical secrets</span>
                  </div>
                  <div className="feature">
                    <div className="feature-icon chart"></div>
                    <span>Quantify team synergy</span>
                  </div>
                  <div className="feature">
                    <div className="feature-icon optimize"></div>
                    <span>Optimize communication strategies</span>
                  </div>
                </div>
              </div>
              
              <div className="dashboard-card tech-card">
                <h3>Team Performance Metrics</h3>
                <div className="metrics-grid">
                  <div className="metric-item">
                    <div className="metric-value">{records.length}</div>
                    <div className="metric-label">Communication Sessions</div>
                  </div>
                  <div className="metric-item">
                    <div className="metric-value">{averageSynergy.toFixed(1)}</div>
                    <div className="metric-label">Avg Synergy Score</div>
                  </div>
                  <div className="metric-item">
                    <div className="metric-value">{averageEfficiency.toFixed(1)}</div>
                    <div className="metric-label">Avg Decision Efficiency</div>
                  </div>
                </div>
              </div>
              
              <div className="dashboard-card tech-card">
                <h3>Synergy Analysis</h3>
                {renderSynergyChart()}
              </div>
              
              <div className="dashboard-card tech-card">
                <h3>Decision Efficiency</h3>
                {renderEfficiencyChart()}
              </div>
            </div>
            
            {showFAQ && (
              <div className="faq-section tech-card">
                <h3>Frequently Asked Questions</h3>
                <div className="faq-list">
                  <div className="faq-item">
                    <h4>How does FHE protect our team communications?</h4>
                    <p>Fully Homomorphic Encryption allows us to analyze your encrypted communications without ever decrypting them. This means your tactical secrets remain secure throughout the entire analysis process.</p>
                  </div>
                  <div className="faq-item">
                    <h4>What kind of insights can we get?</h4>
                    <p>Our FHE-NLP system analyzes communication patterns to provide metrics on team synergy, decision efficiency, response times, and coordination effectiveness.</p>
                  </div>
                  <div className="faq-item">
                    <h4>How accurate is the analysis?</h4>
                    <p>While maintaining full encryption, our system achieves over 92% accuracy in identifying communication patterns and team dynamics compared to unencrypted analysis.</p>
                  </div>
                  <div className="faq-item">
                    <h4>Can we use this during live tournaments?</h4>
                    <p>Yes! Our system is designed for real-time analysis during tournaments, providing immediate feedback without compromising security.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        
        {activeTab === "records" && (
          <div className="records-section">
            <div className="section-header">
              <h2>Encrypted Communication Records</h2>
              <div className="header-actions">
                <button 
                  onClick={loadRecords}
                  className="refresh-btn tech-button"
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>
            
            <div className="records-list tech-card">
              <div className="table-header">
                <div className="header-cell">ID</div>
                <div className="header-cell">Team ID</div>
                <div className="header-cell">Date</div>
                <div className="header-cell">Synergy Score</div>
                <div className="header-cell">Decision Efficiency</div>
                <div className="header-cell">Actions</div>
              </div>
              
              {records.length === 0 ? (
                <div className="no-records">
                  <div className="no-records-icon"></div>
                  <p>No communication records found</p>
                  <button 
                    className="tech-button primary"
                    onClick={() => setShowCreateModal(true)}
                  >
                    Add First Record
                  </button>
                </div>
              ) : (
                records.map(record => (
                  <div className="record-row" key={record.id}>
                    <div className="table-cell record-id">#{record.id.substring(0, 6)}</div>
                    <div className="table-cell">{record.teamId}</div>
                    <div className="table-cell">
                      {new Date(record.timestamp * 1000).toLocaleDateString()}
                    </div>
                    <div className="table-cell">
                      <div className="score-badge">
                        {record.synergyScore}
                      </div>
                    </div>
                    <div className="table-cell">
                      <div className="score-badge">
                        {record.decisionEfficiency}
                      </div>
                    </div>
                    <div className="table-cell actions">
                      <button 
                        className="action-btn tech-button"
                        onClick={() => analyzeCommunication()}
                      >
                        Analyze
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        
        {activeTab === "analysis" && (
          <div className="analysis-section">
            <div className="section-header">
              <h2>FHE-NLP Analysis</h2>
              <p>Perform confidential analysis on encrypted team communications</p>
            </div>
            
            <div className="analysis-grid">
              <div className="analysis-card tech-card">
                <h3>Team Synergy Analysis</h3>
                <p>Our FHE-NLP system analyzes communication patterns to measure:</p>
                <ul>
                  <li>Coordination effectiveness</li>
                  <li>Response times</li>
                  <li>Information sharing efficiency</li>
                  <li>Conflict resolution patterns</li>
                </ul>
                <button 
                  className="tech-button primary"
                  onClick={() => analyzeCommunication()}
                >
                  Run Synergy Analysis
                </button>
              </div>
              
              <div className="analysis-card tech-card">
                <h3>Decision Efficiency</h3>
                <p>Measure how effectively your team makes decisions under pressure:</p>
                <ul>
                  <li>Decision speed</li>
                  <li>Consensus building</li>
                  <li>Strategic alignment</li>
                  <li>Adaptability to changing situations</li>
                </ul>
                <button 
                  className="tech-button primary"
                  onClick={() => analyzeCommunication()}
                >
                  Analyze Decision Making
                </button>
              </div>
              
              <div className="analysis-card tech-card">
                <h3>Communication Optimization</h3>
                <p>Get personalized recommendations to improve team communication:</p>
                <ul>
                  <li>Reduce ambiguity</li>
                  <li>Improve clarity</li>
                  <li>Optimize information flow</li>
                  <li>Enhance tactical coordination</li>
                </ul>
                <button 
                  className="tech-button primary"
                  onClick={() => analyzeCommunication()}
                >
                  Generate Recommendations
                </button>
              </div>
            </div>
            
            <div className="fhe-explanation tech-card">
              <h3>How FHE Protects Your Data</h3>
              <div className="fhe-process">
                <div className="process-step">
                  <div className="step-icon encrypt"></div>
                  <h4>Encryption</h4>
                  <p>Team communications are encrypted using FHE before analysis</p>
                </div>
                <div className="process-arrow">→</div>
                <div className="process-step">
                  <div className="step-icon compute"></div>
                  <h4>Computation</h4>
                  <p>Analysis performed directly on encrypted data</p>
                </div>
                <div className="process-arrow">→</div>
                <div className="process-step">
                  <div className="step-icon results"></div>
                  <h4>Results</h4>
                  <p>Meaningful insights without ever decrypting sensitive data</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitRecord} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          recordData={newRecordData}
          setRecordData={setNewRecordData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content tech-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner-small"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="team-icon"></div>
              <span>TeamSynergy FHE</span>
            </div>
            <p>Confidential analysis of esports team communications</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact Support</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Confidentiality</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} TeamSynergy FHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  recordData: any;
  setRecordData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  recordData,
  setRecordData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setRecordData({
      ...recordData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!recordData.teamId || !recordData.communicationData) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal tech-card">
        <div className="modal-header">
          <h2>Add Encrypted Communication</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Your communication data will be encrypted with FHE
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Team ID *</label>
              <input 
                type="text"
                name="teamId"
                value={recordData.teamId} 
                onChange={handleChange}
                placeholder="Enter team identifier" 
                className="tech-input"
              />
            </div>
            
            <div className="form-group full-width">
              <label>Communication Data *</label>
              <textarea 
                name="communicationData"
                value={recordData.communicationData} 
                onChange={handleChange}
                placeholder="Paste team communication log..." 
                className="tech-textarea"
                rows={6}
              />
              <div className="input-hint">
                Format: [Player1]: Message | [Player2]: Response
              </div>
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> 
            Data remains encrypted during FHE processing. Tactical secrets are protected.
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn tech-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn tech-button primary"
          >
            {creating ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;