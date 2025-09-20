// Shardeum PayFi Hub - Complete Payment Solutions
// Configuration
const SHARDEUM_CHAIN_ID = 8080;
const SHARDEUM_RPC = 'https://sphinx.shardeum.org/';

// Contract configurations (Update these after deployment)
const TIP_JAR_CONTRACT = '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B'; // Update after deploying
const TIP_JAR_ABI = [
    "function sendTip(string memory message) payable",
    "event TipSent(address indexed sender, uint256 amount, string message, uint256 timestamp)"
];

// Global variables
let provider;
let signer;
let tipJarContract;
let userAddress;
let recipients = [];

// Initialize the application
async function init() {
    try {
        updateNetworkStatus('Checking wallet connection...');
        
        if (typeof window.ethereum !== 'undefined') {
            provider = new ethers.BrowserProvider(window.ethereum);
            
            // Check if already connected
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                await connectWallet();
            }
        } else {
            updateNetworkStatus('MetaMask not detected');
            showStatus('Please install MetaMask to use this dApp', 'error');
        }
        
        loadStatistics();
        loadTransactionHistory();
        
    } catch (error) {
        console.error('Initialization error:', error);
        updateNetworkStatus('Connection failed');
    }
}

// Wallet connection
async function connectWallet() {
    try {
        if (typeof window.ethereum === 'undefined') {
            alert('Please install MetaMask to use this dApp!');
            return;
        }

        showStatus('Connecting to wallet...', 'info');
        
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        signer = await provider.getSigner();
        userAddress = await signer.getAddress();

        // Check and switch to Shardeum network
        await switchToShardeum();
        
        // Initialize contract
        tipJarContract = new ethers.Contract(TIP_JAR_CONTRACT, TIP_JAR_ABI, signer);
        
        updateWalletUI();
        updateNetworkStatus('Connected to Shardeum Sphinx');
        showStatus('Wallet connected successfully!', 'success');
        
    } catch (error) {
        console.error('Connection error:', error);
        showStatus('Failed to connect wallet: ' + error.message, 'error');
        updateNetworkStatus('Connection failed');
    }
}

async function switchToShardeum() {
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${SHARDEUM_CHAIN_ID.toString(16)}` }]
        });
    } catch (switchError) {
        if (switchError.code === 4902) {
            try {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: `0x${SHARDEUM_CHAIN_ID.toString(16)}`,
                        chainName: 'Shardeum Sphinx 1.X',
                        rpcUrls: [SHARDEUM_RPC],
                        nativeCurrency: {
                            name: 'Shardeum',
                            symbol: 'SHM',
                            decimals: 18
                        },
                        blockExplorerUrls: ['https://explorer-sphinx.shardeum.org/']
                    }]
                });
            } catch (addError) {
                throw new Error('Failed to add Shardeum network');
            }
        } else {
            throw switchError;
        }
    }
}

function updateWalletUI() {
    const connectButton = document.getElementById('connectButton');
    const walletInfo = document.getElementById('walletInfo');
    const tipInterface = document.getElementById('tipInterface');
    
    if (userAddress) {
        connectButton.style.display = 'none';
        walletInfo.style.display = 'block';
        tipInterface.style.display = 'block';
        
        const shortAddress = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
        walletInfo.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span><strong>Connected:</strong> ${shortAddress}</span>
                <button onclick="disconnectWallet()" style="background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 4px 12px; border-radius: 6px; font-size: 12px; cursor: pointer;">
                    Disconnect
                </button>
            </div>
        `;
    } else {
        connectButton.style.display = 'block';
        walletInfo.style.display = 'none';
        tipInterface.style.display = 'none';
    }
}

function disconnectWallet() {
    userAddress = null;
    signer = null;
    tipJarContract = null;
    updateWalletUI();
    updateNetworkStatus('Disconnected');
    showStatus('Wallet disconnected', 'info');
}

// Tip functionality
async function sendTip() {
    if (!signer || !userAddress) {
        showStatus('Please connect your wallet first', 'error');
        return;
    }

    const amount = getSelectedAmount();
    const message = document.getElementById('tipMessage').value || '';
    const recipientAddress = document.getElementById('recipientAddress').value.trim();

    if (!amount || amount <= 0) {
        showStatus('Please enter a valid tip amount', 'error');
        return;
    }

    if (!recipientAddress) {
        showStatus('Please enter a recipient address', 'error');
        return;
    }

    // Validate address format
    if (!ethers.isAddress(recipientAddress)) {
        // Check if it might be an ENS name
        if (recipientAddress.includes('.eth')) {
            showStatus('ENS names are not supported on Shardeum network', 'error');
            return;
        } else {
            showStatus('Please enter a valid wallet address', 'error');
            return;
        }
    }

    try {
        showStatus('Sending tip... Please confirm in MetaMask', 'info');
        
        // Send direct transfer to recipient address
        const tx = await signer.sendTransaction({
            to: recipientAddress,
            value: ethers.parseEther(amount.toString()),
            gasLimit: 21000
        });
        
        showStatus('Transaction submitted! Confirming...', 'info');
        
        const receipt = await tx.wait();
        
        // Save to local storage for display
        saveTransaction({
            hash: tx.hash,
            amount: amount,
            message: message,
            recipient: recipientAddress,
            timestamp: Date.now(),
            from: userAddress,
            type: 'tip'
        });
        
        showStatus(`Tip sent successfully! Gas used: ${receipt.gasUsed.toString()}`, 'success');
        
        // Reset form
        document.getElementById('tipMessage').value = '';
        document.getElementById('recipientAddress').value = '';
        clearSelectedAmount();
        
        // Update statistics and history
        updateStatistics();
        loadTransactionHistory();
        
    } catch (error) {
        console.error('Tip error:', error);
        if (error.code === 4001) {
            showStatus('Transaction cancelled by user', 'info');
        } else if (error.code === 'INSUFFICIENT_FUNDS') {
            showStatus('Insufficient SHM balance for this transaction', 'error');
        } else {
            showStatus('Failed to send tip: ' + error.message, 'error');
        }
    }
}

function getSelectedAmount() {
    const customAmount = document.getElementById('customAmount');
    const activePreset = document.querySelector('.preset-btn.active');
    
    if (customAmount && customAmount.value) {
        return parseFloat(customAmount.value);
    } else if (activePreset) {
        return parseFloat(activePreset.dataset.amount);
    }
    return 0;
}

function clearSelectedAmount() {
    const customAmount = document.getElementById('customAmount');
    const presetBtns = document.querySelectorAll('.preset-btn');
    
    if (customAmount) customAmount.value = '';
    presetBtns.forEach(btn => btn.classList.remove('active'));
}

// Tab navigation
function switchTab(tabName) {
    // Update tab buttons
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    event.target.classList.add('active');
    
    // Update tab content
    const contents = document.querySelectorAll('.tab-content');
    contents.forEach(content => content.classList.remove('active'));
    document.getElementById(tabName + '-tab').classList.add('active');
}

// P2P Bill Splitting
function addRecipient() {
    const addressInput = document.getElementById('recipientAddress');
    const nameInput = document.getElementById('recipientName');
    
    const address = addressInput.value.trim();
    const name = nameInput.value.trim() || 'Anonymous';
    
    if (!address) {
        showStatus('Please enter a valid wallet address', 'error');
        return;
    }
    
    if (!ethers.isAddress(address)) {
        showStatus('Please enter a valid Ethereum address', 'error');
        return;
    }
    
    recipients.push({ address, name });
    updateRecipientList();
    
    addressInput.value = '';
    nameInput.value = '';
}

function updateRecipientList() {
    const list = document.getElementById('recipientList');
    const splitButton = document.getElementById('splitBillButton');
    
    if (recipients.length === 0) {
        list.innerHTML = `
            <div style="text-align: center; color: #999; padding: 20px;">
                <i class="fas fa-user-friends" style="font-size: 2rem; margin-bottom: 10px; opacity: 0.5;"></i>
                <div>Add recipients to split the bill</div>
            </div>
        `;
        splitButton.disabled = true;
    } else {
        const totalAmount = parseFloat(document.getElementById('totalBillAmount').value) || 0;
        const amountPerPerson = totalAmount / recipients.length;
        
        list.innerHTML = recipients.map((recipient, index) => `
            <div class="recipient-item">
                <div class="recipient-info">
                    <div style="font-weight: bold;">${recipient.name}</div>
                    <div class="recipient-address">${recipient.address}</div>
                </div>
                <div class="recipient-amount">${amountPerPerson.toFixed(4)} SHM</div>
                <button class="remove-recipient" onclick="removeRecipient(${index})">×</button>
            </div>
        `).join('');
        
        splitButton.disabled = totalAmount <= 0;
    }
}

function removeRecipient(index) {
    recipients.splice(index, 1);
    updateRecipientList();
}

async function splitBill() {
    if (!signer || recipients.length === 0) {
        showStatus('Please connect wallet and add recipients', 'error');
        return;
    }
    
    const totalAmount = parseFloat(document.getElementById('totalBillAmount').value);
    if (!totalAmount || totalAmount <= 0) {
        showStatus('Please enter a valid total amount', 'error');
        return;
    }
    
    const amountPerPerson = totalAmount / recipients.length;
    
    try {
        showStatus(`Splitting ${totalAmount} SHM among ${recipients.length} people...`, 'info');
        
        for (let i = 0; i < recipients.length; i++) {
            const recipient = recipients[i];
            
            const tx = await signer.sendTransaction({
                to: recipient.address,
                value: ethers.parseEther(amountPerPerson.toString()),
                gasLimit: 21000
            });
            
            showStatus(`Sent ${amountPerPerson.toFixed(4)} SHM to ${recipient.name} (${i + 1}/${recipients.length})`, 'info');
            
            await tx.wait();
            
            // Save transaction
            saveTransaction({
                hash: tx.hash,
                amount: amountPerPerson,
                recipient: recipient.address,
                recipientName: recipient.name,
                timestamp: Date.now(),
                from: userAddress,
                type: 'bill_split'
            });
        }
        
        showStatus('Bill split successfully! All payments sent.', 'success');
        
        // Reset form
        recipients = [];
        document.getElementById('totalBillAmount').value = '';
        updateRecipientList();
        updateStatistics();
        loadTransactionHistory();
        
    } catch (error) {
        console.error('Bill split error:', error);
        showStatus('Failed to split bill: ' + error.message, 'error');
    }
}

// Subscription Management
async function createSubscription() {
    if (!signer) {
        showStatus('Please connect your wallet first', 'error');
        return;
    }
    
    const amount = parseFloat(document.getElementById('subAmount').value);
    const frequency = document.getElementById('subFrequency').value;
    const recipient = document.getElementById('subRecipient').value;
    
    if (!amount || amount <= 0) {
        showStatus('Please enter a valid subscription amount', 'error');
        return;
    }
    
    if (!ethers.isAddress(recipient)) {
        showStatus('Please enter a valid recipient address', 'error');
        return;
    }
    
    // For demo purposes, we'll simulate creating a subscription
    // In a real implementation, you'd deploy a subscription contract
    
    const subscription = {
        id: Date.now(),
        amount: amount,
        frequency: frequency,
        recipient: recipient,
        nextPayment: getNextPaymentDate(frequency),
        active: true,
        created: Date.now()
    };
    
    // Save to localStorage (in production, this would be on-chain)
    const subscriptions = JSON.parse(localStorage.getItem('subscriptions') || '[]');
    subscriptions.push(subscription);
    localStorage.setItem('subscriptions', JSON.stringify(subscriptions));
    
    showStatus(`Subscription created! Next payment: ${subscription.nextPayment.toLocaleDateString()}`, 'success');
    
    // Reset form
    document.getElementById('subAmount').value = '';
    document.getElementById('subRecipient').value = '';
}

function getNextPaymentDate(frequency) {
    const now = new Date();
    switch (frequency) {
        case 'weekly':
            return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        case 'monthly':
            return new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
        case 'quarterly':
            return new Date(now.getFullYear(), now.getMonth() + 3, now.getDate());
        case 'yearly':
            return new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
        default:
            return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    }
}

// Crowdfunding
async function contributeToCampaign() {
    if (!signer) {
        showStatus('Please connect your wallet first', 'error');
        return;
    }
    
    const amount = parseFloat(document.getElementById('contributionAmount').value);
    
    if (!amount || amount <= 0) {
        showStatus('Please enter a valid contribution amount', 'error');
        return;
    }
    
    try {
        showStatus('Processing contribution...', 'info');
        
        // For demo, send to a campaign address (in production, use a crowdfunding contract)
        const campaignAddress = '0x742d35Cc6634C0532925a3b8D0b4E0a5420C8b71'; // Demo address
        
        const tx = await signer.sendTransaction({
            to: campaignAddress,
            value: ethers.parseEther(amount.toString()),
            gasLimit: 21000
        });
        
        await tx.wait();
        
        // Update campaign stats (demo)
        const currentRaised = parseFloat(document.getElementById('campaignRaised').textContent);
        const currentBackers = parseInt(document.getElementById('campaignBackers').textContent);
        
        document.getElementById('campaignRaised').textContent = (currentRaised + amount).toFixed(1);
        document.getElementById('campaignBackers').textContent = currentBackers + 1;
        
        // Update progress bar
        const goal = parseFloat(document.getElementById('campaignGoal').textContent);
        const newProgress = ((currentRaised + amount) / goal) * 100;
        document.getElementById('campaignProgress').style.width = `${Math.min(newProgress, 100)}%`;
        
        // Save transaction
        saveTransaction({
            hash: tx.hash,
            amount: amount,
            timestamp: Date.now(),
            from: userAddress,
            type: 'crowdfunding',
            campaign: 'Shardeum dApp Development Fund'
        });
        
        showStatus(`Thank you! Contributed ${amount} SHM to the campaign.`, 'success');
        
        document.getElementById('contributionAmount').value = '';
        updateStatistics();
        loadTransactionHistory();
        
    } catch (error) {
        console.error('Contribution error:', error);
        showStatus('Failed to contribute: ' + error.message, 'error');
    }
}

// Campus Economy
async function buyCampusItem(itemType, price) {
    if (!signer) {
        showStatus('Please connect your wallet first', 'error');
        return;
    }
    
    try {
        showStatus(`Purchasing ${itemType.replace('-', ' ')}...`, 'info');
        
        // For demo, send to campus treasury (in production, use a marketplace contract)
        const campusTreasury = '0x8ba1f109551bD432803012645Hac136c29B24D4C'; // Demo address
        
        const tx = await signer.sendTransaction({
            to: campusTreasury,
            value: ethers.parseEther(price.toString()),
            gasLimit: 21000
        });
        
        await tx.wait();
        
        // Save transaction
        saveTransaction({
            hash: tx.hash,
            amount: price,
            timestamp: Date.now(),
            from: userAddress,
            type: 'campus_purchase',
            item: itemType
        });
        
        showStatus(`Successfully purchased ${itemType.replace('-', ' ')}!`, 'success');
        updateStatistics();
        loadTransactionHistory();
        
    } catch (error) {
        console.error('Purchase error:', error);
        showStatus('Failed to purchase item: ' + error.message, 'error');
    }
}

// Statistics and data management
function saveTransaction(transaction) {
    const transactions = JSON.parse(localStorage.getItem('transactions') || '[]');
    transactions.unshift(transaction); // Add to beginning
    
    // Keep only last 50 transactions
    if (transactions.length > 50) {
        transactions.splice(50);
    }
    
    localStorage.setItem('transactions', JSON.stringify(transactions));
}

function loadTransactionHistory() {
    const transactions = JSON.parse(localStorage.getItem('transactions') || '[]');
    const container = document.getElementById('recentTipsList');
    const noTipsMessage = document.getElementById('noTipsMessage');
    
    if (transactions.length === 0) {
        noTipsMessage.style.display = 'block';
        return;
    }
    
    noTipsMessage.style.display = 'none';
    
    container.innerHTML = transactions.slice(0, 10).map(tx => {
        const date = new Date(tx.timestamp).toLocaleDateString();
        const time = new Date(tx.timestamp).toLocaleTimeString();
        
        let typeIcon = '💸';
        let typeLabel = 'Tip';
        let details = tx.message || 'No message';
        
        switch (tx.type) {
            case 'bill_split':
                typeIcon = '👥';
                typeLabel = 'Bill Split';
                details = `Split with ${tx.recipientName || 'Unknown'}`;
                break;
            case 'crowdfunding':
                typeIcon = '🎯';
                typeLabel = 'Crowdfunding';
                details = tx.campaign || 'Campaign contribution';
                break;
            case 'campus_purchase':
                typeIcon = '🏫';
                typeLabel = 'Campus';
                details = tx.item ? tx.item.replace('-', ' ') : 'Campus purchase';
                break;
            case 'tip':
            default:
                if (tx.recipient) {
                    const shortRecipient = `${tx.recipient.slice(0, 6)}...${tx.recipient.slice(-4)}`;
                    details = `To: ${shortRecipient}${tx.message ? ` - ${tx.message}` : ''}`;
                } else {
                    details = tx.message || 'No message';
                }
                break;
        }
        
        return `
            <div class="tip-item">
                <div class="tip-info">
                    <div class="tip-amount">${typeIcon} ${tx.amount} SHM</div>
                    <div class="tip-message">${typeLabel}: ${details}</div>
                    <div class="tip-meta">${date} at ${time}</div>
                </div>
                <a href="https://explorer-sphinx.shardeum.org/transaction/${tx.hash}" 
                   target="_blank" 
                   style="color: #f69550; text-decoration: none; font-size: 12px;">
                    <i class="fas fa-external-link-alt"></i> View
                </a>
            </div>
        `;
    }).join('');
}

function updateStatistics() {
    const transactions = JSON.parse(localStorage.getItem('transactions') || '[]');
    
    if (transactions.length === 0) {
        return;
    }
    
    const totalVolume = transactions.reduce((sum, tx) => sum + tx.amount, 0);
    const totalTransactions = transactions.length;
    const avgTransaction = totalVolume / totalTransactions;
    
    document.getElementById('totalVolume').textContent = totalVolume.toFixed(2);
    document.getElementById('totalTransactions').textContent = totalTransactions;
    document.getElementById('avgTransaction').textContent = avgTransaction.toFixed(3);
}

function loadStatistics() {
    updateStatistics();
}

function updateNetworkStatus(status) {
    document.getElementById('networkStatus').textContent = status;
}

function showStatus(message, type = 'info') {
    const statusElements = ['status', 'splitStatus', 'subStatus', 'campaignStatus', 'campusStatus'];
    
    statusElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = message;
            element.className = `status-${type}`;
            
            // Auto-clear success and info messages
            if (type === 'success' || type === 'info') {
                setTimeout(() => {
                    element.textContent = '';
                    element.className = '';
                }, 5000);
            }
        }
    });
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Connect wallet button
    const connectButton = document.getElementById('connectButton');
    if (connectButton) {
        connectButton.addEventListener('click', connectWallet);
    }
    
    // Send tip button
    const sendTipButton = document.getElementById('sendTipButton');
    if (sendTipButton) {
        sendTipButton.addEventListener('click', sendTip);
    }
    
    // Preset amount buttons
    const presetButtons = document.querySelectorAll('.preset-btn');
    presetButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            // Remove active class from all buttons
            presetButtons.forEach(b => b.classList.remove('active'));
            // Add active class to clicked button
            this.classList.add('active');
            // Clear custom amount
            const customAmount = document.getElementById('customAmount');
            if (customAmount) {
                customAmount.value = '';
            }
        });
    });
    
    // Preset recipient buttons
    const presetRecipientButtons = document.querySelectorAll('.preset-recipient');
    presetRecipientButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const recipientInput = document.getElementById('recipientAddress');
            if (recipientInput) {
                recipientInput.value = this.dataset.address;
                // Add visual feedback
                this.style.background = '#e6f7ff';
                this.style.borderColor = '#91d5ff';
                setTimeout(() => {
                    this.style.background = '#f0f0f0';
                    this.style.borderColor = '#ddd';
                }, 1000);
            }
        });
    });
    
    // Custom amount input
    const customAmountInput = document.getElementById('customAmount');
    if (customAmountInput) {
        customAmountInput.addEventListener('input', function() {
            // Clear preset selections when typing custom amount
            presetButtons.forEach(btn => btn.classList.remove('active'));
        });
    }
    
    // Bill splitting - update recipient list when total changes
    const totalBillInput = document.getElementById('totalBillAmount');
    if (totalBillInput) {
        totalBillInput.addEventListener('input', updateRecipientList);
    }
    
    // Account change detection
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', function(accounts) {
            if (accounts.length === 0) {
                disconnectWallet();
            } else {
                location.reload(); // Reload to reconnect with new account
            }
        });
        
        window.ethereum.on('chainChanged', function(chainId) {
            location.reload(); // Reload on network change
        });
    }
    
    // Initialize the app
    init();
});

// Add styles for status messages
const statusStyle = document.createElement('style');
statusStyle.textContent = `
    .status-success {
        color: #4CAF50 !important;
    }
    .status-error {
        color: #f44336 !important;
    }
    .status-info {
        color: #f69550 !important;
    }
`;
document.head.appendChild(statusStyle);