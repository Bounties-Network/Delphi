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

advanceTimeAndBlock = async (time) => {
    await advanceTime(time);
    await advanceBlock();
}

advanceTime = (time) => {
  return web3.currentProvider.send({
    jsonrpc: "2.0",
    method: "evm_increaseTime",
    params: [time],
    id: new Date().getTime()
  })
}

advanceBlock = () => {
  return web3.currentProvider.send({
    jsonrpc: "2.0",
    method: "evm_mine",
    id: new Date().getTime()
  })
}

const getBlockNumber = () => new Promise((resolve, reject) => {
  web3.eth.getBlockNumber((error, result) => {
    if (error) reject(error)
    resolve(result)
  })
})

const getBlock = block => new Promise((resolve, reject) => {
  web3.eth.getBlock(block, (error, result) => {
    if (error) reject(error)
    resolve(result)
  })
})

module.exports = {
  initializeStakeBuilder,
  getAccounts,
  advanceTimeAndBlock,
  getBlockNumber,
  getBlock
};