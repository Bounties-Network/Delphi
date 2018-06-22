/* global artifacts */

const DelphiVotingFactory = artifacts.require('DelphiVotingFactory.sol');
const DemocraticParameterizerFactory =
  artifacts.require('democratic-parameterizer/DemocraticParameterizerFactory.sol');

module.exports = deployer => deployer.deploy(DemocraticParameterizerFactory)
  .then(() => deployer.deploy(DelphiVotingFactory, DemocraticParameterizerFactory.address));

