/* global artifacts */

const Registry = artifacts.require('Registry.sol');
const Token = artifacts.require('EIP20.sol');
const Parameterizer = artifacts.require('Parameterizer.sol');
const DLL = artifacts.require('dll/DLL.sol');
const Challenge = artifacts.require('Challenge.sol');
const AttributeStore = artifacts.require('attrstore/AttributeStore.sol');
const PLCRVoting = artifacts.require('PLCRVoting.sol');

const fs = require('fs');

module.exports = (deployer, network, accounts) => {
  async function giveTokensTo(addresses) {
    const token = await Token.deployed();
    const user = addresses[0];
    await token.transfer(user, '100000');
    if (addresses.length === 1) { return true; }
    return giveTokensTo(addresses.slice(1));
  }

  const config = JSON.parse(fs.readFileSync('./conf/registryConfig.json'));
  const parameterizerConfig = config.paramDefaults;
  let tokenAddress = config.TokenAddress;

  deployer.deploy(DLL);
  deployer.deploy(AttributeStore);
  deployer.deploy(Challenge);

  deployer.link(DLL, PLCRVoting);
  deployer.link(AttributeStore, PLCRVoting);

  deployer.link(DLL, Parameterizer);
  deployer.link(AttributeStore, Parameterizer);
  deployer.link(Challenge, Parameterizer);

  deployer.link(DLL, Registry);
  deployer.link(AttributeStore, Registry);
  deployer.link(Challenge, Registry);

  deployer.deploy(Token, '1000000', 'TestCoin', '0', 'TEST');

  return deployer.then(async () => {
    if (network === 'test') {
      tokenAddress = Token.address;
    }
    return deployer.deploy(
      PLCRVoting,
      tokenAddress,
    );
  })
    .then(() =>
      deployer.deploy(
        Parameterizer,
        tokenAddress,
        PLCRVoting.address,
        parameterizerConfig.minDeposit,
        parameterizerConfig.pMinDeposit,
        parameterizerConfig.applyStageLength,
        parameterizerConfig.pApplyStageLength,
        parameterizerConfig.commitStageLength,
        parameterizerConfig.pCommitStageLength,
        parameterizerConfig.revealStageLength,
        parameterizerConfig.pRevealStageLength,
        parameterizerConfig.dispensationPct,
        parameterizerConfig.pDispensationPct,
        parameterizerConfig.voteQuorum,
        parameterizerConfig.pVoteQuorum,
      )
        .then(() =>
          deployer.deploy(
            Registry,
            tokenAddress,
            PLCRVoting.address,
            Parameterizer.address,
          ))
        .then(async () => {
          await giveTokensTo(accounts);
        }).catch((err) => { throw err; }));
};
