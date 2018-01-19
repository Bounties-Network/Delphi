/* global artifacts */

const DelphiVoting = artifacts.require('DelphiVoting.sol');
const Registry = artifacts.require('Registry.sol');
const Parameterizer = artifacts.require('Parameterizer.sol');

module.exports = (deployer) => {
  deployer.deploy(DelphiVoting, Registry.address, Parameterizer.address);
};

