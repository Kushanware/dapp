// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract ShardeumTipJar {
    struct Tip {
        address sender;
        uint256 amount;
        string message;
        uint256 timestamp;
    }
    
    address public owner;
    Tip[] public tips;
    uint256 public totalTips;
    uint256 public totalAmount;
    
    event TipSent(
        address indexed sender, 
        uint256 amount, 
        string message, 
        uint256 timestamp
    );
    
    constructor() {
        owner = msg.sender;
    }
    
    function sendTip(string memory message) public payable {
        require(msg.value > 0, "Tip must be greater than 0");
        
        tips.push(Tip({
            sender: msg.sender,
            amount: msg.value,
            message: message,
            timestamp: block.timestamp
        }));
        
        totalTips++;
        totalAmount += msg.value;
        
        emit TipSent(msg.sender, msg.value, message, block.timestamp);
    }
    
    function getTip(uint256 index) public view returns (
        address sender,
        uint256 amount,
        string memory message,
        uint256 timestamp
    ) {
        require(index < tips.length, "Tip does not exist");
        Tip memory tip = tips[index];
        return (tip.sender, tip.amount, tip.message, tip.timestamp);
    }
    
    function getTipCount() public view returns (uint256) {
        return tips.length;
    }
    
    function withdraw() public {
        require(msg.sender == owner, "Only owner can withdraw");
        require(address(this).balance > 0, "No funds to withdraw");
        
        payable(owner).transfer(address(this).balance);
    }
    
    function getContractBalance() public view returns (uint256) {
        return address(this).balance;
    }
}