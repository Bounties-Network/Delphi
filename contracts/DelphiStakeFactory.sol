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
    address newStake = new Proxy(masterCopy);
    stakes.push(DelphiStake(newStake));
    stakes[stakes.length - 1].initDelphiStake(_value, _token, _minimumFee, _data, _stakeReleaseTime, _arbiter);

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
