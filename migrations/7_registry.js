/* global artifacts */

const Registry = artifacts.require('tcr/Registry.sol');
const Token = artifacts.require('tokens/eip20/EIP20.sol');
const Parameterizer = artifacts.require('tcr/Parameterizer.sol');
const DLL = artifacts.require('dll/DLL.sol');
const AttributeStore = artifacts.require('attrstore/AttributeStore.sol');
const PLCRVoting = artifacts.require('tcr/PLCRVoting.sol');

const fs = require('fs');

module.exports = (deployer, network, accounts) => {
  async function approveRegistryFor(addresses) {
    const token = await Token.deployed();
    const user = addresses[0];
    const balanceOfUser = await token.balanceOf(user);
    await token.approve(Registry.address, balanceOfUser, { from: user });
    if (addresses.length === 1) { return true; }
    return approveRegistryFor(addresses.slice(1));
  }

  deployer.link(DLL, Registry);
  deployer.link(AttributeStore, Registry);

  return deployer.then(async () => {
    const config = JSON.parse(fs.readFileSync('./conf/tcrConfig.json'));
    let tokenAddress = config.token.address;

    if (config.token.deployToken) {
      tokenAddress = Token.address;
    }

    return deployer.deploy(
      Registry,
      tokenAddress,
      PLCRVoting.address,
      Parameterizer.address,
      config.name,
    );
  })
    .then(async () => {
      if (network === 'test' || network === 'coverage') {
        await approveRegistryFor(accounts);
      }
    }).catch((err) => { throw err; });
};

