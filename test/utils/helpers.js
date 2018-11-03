const config = require('./config');

const initializeStakeBuilder = (stake, token, stakerAddress) => ({
    staker=stakerAddress,
    value=config.initialStake,
    tokenAddress=token.address,
    data=config.data,
    releaseTime=config.releaseTime
  } = {}) => stake.initDelphiStake(
    staker,
    value,
    tokenAddress,
    data,
    releaseTime,
    { from: staker }
  );

const getAccounts = accounts => ({
  staker: accounts[0],
  claimant: accounts[1],
  arbiter: accounts[2],
  other: accounts[3]
});

module.exports = { initializeStakeBuilder, getAccounts };