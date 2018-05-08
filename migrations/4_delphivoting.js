/* global artifacts */

const DelphiVoting = artifacts.require('DelphiVoting.sol');
const Registry = artifacts.require('tcr/Registry.sol');
const Parameterizer = artifacts.require('tcr/Parameterizer.sol');
const DLL = artifacts.require('dll/DLL.sol');

module.exports = deployer => deployer.then(async () => {
  await deployer.link(DLL, DelphiVoting);
  return deployer.deploy(DelphiVoting, Registry.address, Parameterizer.address);
});

