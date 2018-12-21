/* global artifacts */

const Stake = artifacts.require('Stake.sol');
const StakeFactory = artifacts.require('StakeFactory.sol');

module.exports = deployer => deployer.deploy(Stake)
  .then(() => deployer.deploy(StakeFactory, Stake.address));
