// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract ShardeumTipJar {
    address payable public owner;
    uint256 public totalTips;
    uint256 public tipCount;
    
    struct Tip {
        address tipper;
        uint256 amount;
        string message;
        uint256 timestamp;
    }
    
    Tip[] public tips;
    
    event TipSent(
        address indexed tipper,
        uint256 amount,
        string message,
        uint256 timestamp
    );
    
    constructor() {
        owner = payable(msg.sender);
    }
    
    function sendTip(string memory _message) public payable {
        require(msg.value > 0, "Tip must be greater than 0");
        
        tips.push(Tip({
            tipper: msg.sender,
            amount: msg.value,
            message: _message,
            timestamp: block.timestamp
        }));
        
        totalTips += msg.value;
        tipCount++;
        
        emit TipSent(msg.sender, msg.value, _message, block.timestamp);
    }
    
    function getTip(uint256 _index) public view returns (address, uint256, string memory, uint256) {
        require(_index < tips.length, "Tip does not exist");
        Tip memory tip = tips[_index];
        return (tip.tipper, tip.amount, tip.message, tip.timestamp);
    }
    
    function getTipCount() public view returns (uint256) {
        return tips.length;
    }
    
    function getContractBalance() public view returns (uint256) {
        return address(this).balance;
    }
    
    function withdrawTips() public {
        require(msg.sender == owner, "Only owner can withdraw");
        owner.transfer(address(this).balance);
    }
}