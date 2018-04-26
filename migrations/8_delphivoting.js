/* global artifacts */

const DelphiVoting = artifacts.require('DelphiVoting.sol');
const Registry = artifacts.require('tcr/Registry.sol');
const Parameterizer = artifacts.require('tcr/Parameterizer.sol');

module.exports = (deployer) => {
  deployer.deploy(DelphiVoting, Registry.address, Parameterizer.address);
};
