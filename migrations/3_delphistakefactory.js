/* global artifacts */

const DelphiStake = artifacts.require('DelphiStake.sol');
const DelphiStakeFactory = artifacts.require('DelphiStakeFactory.sol');

module.exports = (deployer) => {
  deployer.deploy(DelphiStakeFactory, DelphiStake.address);
};
