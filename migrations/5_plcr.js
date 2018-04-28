/* global artifacts */

const Token = artifacts.require('tokens/eip20/EIP20.sol');
const DLL = artifacts.require('dll/DLL.sol');
const AttributeStore = artifacts.require('attrstore/AttributeStore.sol');
const PLCRVoting = artifacts.require('tcr/PLCRVoting.sol');

const fs = require('fs');

module.exports = (deployer, network, accounts) => {
  async function approvePLCRFor(addresses) {
    const token = await Token.deployed();
    const user = addresses[0];
    const balanceOfUser = await token.balanceOf(user);
    await token.approve(PLCRVoting.address, balanceOfUser, { from: user });
    if (addresses.length === 1) { return true; }
    return approvePLCRFor(addresses.slice(1));
  }

  deployer.link(DLL, PLCRVoting);
  deployer.link(AttributeStore, PLCRVoting);

  return deployer.then(async () => {
    const config = JSON.parse(fs.readFileSync('./conf/tcrConfig.json'));
    let tokenAddress = config.token.address;

    if (config.token.deployToken) {
      tokenAddress = Token.address;
    }

    return deployer.deploy(
      PLCRVoting,
      tokenAddress,
    );
  })
    .then(async () => {
      if (network === 'test' || network === 'coverage') {
        await approvePLCRFor(accounts);
      }
    }).catch((err) => { throw err; });
};

