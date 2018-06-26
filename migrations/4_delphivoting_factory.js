/* global artifacts */

const DelphiVotingFactory = artifacts.require('DelphiVotingFactory.sol');
const DemocraticParameterizerFactory =
  artifacts.require('democratic-parameterizer/DemocraticParameterizerFactory.sol');
const DLL = artifacts.require('dll/DLL.sol');

module.exports = (deployer) => {
  deployer.deploy(DLL);
  deployer.link(DLL, DelphiVotingFactory);

  return deployer.deploy(DemocraticParameterizerFactory)
    .then(() => deployer.deploy(DelphiVotingFactory, DemocraticParameterizerFactory.address));
};

