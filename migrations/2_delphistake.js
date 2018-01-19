/* global artifacts */

const DelphiStake = artifacts.require('DelphiStake.sol');
const fs = require('fs');

module.exports = (deployer, network, accounts) => {
  const conf = JSON.parse(fs.readFileSync('./conf/config.json'));

  let arbiter;
  if (network === 'test') {
    arbiter = accounts[2]; // test actors are [staker, claimant, arbiter, ...]
  } else {
    arbiter = conf.arbiter;
  }

  deployer.deploy(DelphiStake, conf.initialStake, conf.stakeTokenAddr, conf.data,
    conf.lockupPeriod, arbiter, { value: conf.initialStake });
};

