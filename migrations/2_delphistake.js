/* global artifacts */

const DelphiStake = artifacts.require('DelphiStake.sol');

module.exports = (deployer) => {
  deployer.deploy(DelphiStake);
};
