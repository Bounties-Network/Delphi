pragma solidity ^0.4.18;
import "./inherited/Proxy.sol";
import "./DelphiStake.sol";

contract DelphiStakeFactory {

  event StakeCreated(uint _stakeId, address _contractAddress);

  DelphiStake[] public stakes;

  address public masterCopy;


  function DelphiStakeFactory(address _masterCopy){
    masterCopy = _masterCopy;
  }

  function createDelphiStake(uint _value, EIP20 _token, uint _minimumFee, string _data, uint _stakeReleaseTime, address _arbiter)
  public
  {
    // Revert if the specified value to stake cannot be transferred in
    require(_token.transferFrom(msg.sender, this, _value));

    address newStake = new Proxy(masterCopy);
    stakes.push(DelphiStake(newStake));

    _token.approve(newStake, _value);
    
    stakes[stakes.length - 1].initDelphiStake(msg.sender, _value, _token, _minimumFee, _data, _stakeReleaseTime, _arbiter);

    StakeCreated(stakes.length - 1, stakes[stakes.length - 1]);
  }

  function getNumStakes()
  public
  constant
  returns (uint)
  {
    return stakes.length;
  }

}
