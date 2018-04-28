/* global artifacts */

/* This migration deploys the TCR and its constituent contracts, and should only be executed when
 * the network is either "test" or "coverage". In production, the TCR should be deployed as a
 * standalone system which a DelphiVoting contract can specify the address of for its constructor
 * at deploy-time.
 */

const Token = artifacts.require('tokens/eip20/EIP20.sol');
const DLL = artifacts.require('dll/DLL.sol');
const AttributeStore = artifacts.require('attrstore/AttributeStore.sol');
const PLCRVoting = artifacts.require('tcr/PLCRVoting.sol');
const Parameterizer = artifacts.require('tcr/Parameterizer.sol');
const Registry = artifacts.require('tcr/Registry.sol');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('../conf/tcrConfig.json'));

module.exports = (deployer, network) => {
  if (network === 'test' || network === 'coverage') {
    // Deploy a token contract
    deployer.deploy(
      Token, config.token.supply, config.token.name, config.token.decimals,
      config.token.symbol,
    )
    // Disburse tokens to the hodlers specified in tcrConfig.json
      .then(async () => {
        const token = await Token.deployed();
        return Promise.all(
          config.token.tokenHolders.map(async (tokenHolder) => {
            await token.transfer(tokenHolder.address, tokenHolder.amount);
            // eslint-disable-next-line
            console.log(`Disbursed ${tokenHolder.amount} ${config.token.symbol} tokens to ` +
            `${tokenHolder.address}.`);
          }),
        );
      })
    // Deploy two libraries depended on by PLCRVoting
      .then(async () => {
        // eslint-disable-next-line
        console.log('Deploying libs for PLCRVoting');
        await deployer.deploy(DLL);
        return deployer.deploy(AttributeStore);
      })
    // Deploy PLCRVoting
      .then(async () => {
        // eslint-disable-next-line
        console.log('Deploying PLCRVoting');

        await deployer.link(DLL, PLCRVoting);
        await deployer.link(AttributeStore, PLCRVoting);

        await deployer.deploy(
          PLCRVoting,
          Token.address,
        );

        // Approve PLCRVoting to transfer tokens from hodlers.
        // TODO: Move this out of the migrations and into the tests
        const token = await Token.deployed();
        return Promise.all(
          config.token.tokenHolders.map(async tokenHolder =>
            token.approve(PLCRVoting.address, tokenHolder.amount, { from: tokenHolder.address }),
          ),
        );
      })
    // Deploy Parameterizer
      .then(async () => {
        // eslint-disable-next-line
        console.log('Deploying TCR Parameterizer');

        await deployer.link(DLL, Parameterizer);
        await deployer.link(AttributeStore, Parameterizer);

        await deployer.deploy(
          Parameterizer,
          Token.address,
          PLCRVoting.address,
          config.paramDefaults.minDeposit,
          config.paramDefaults.pMinDeposit,
          config.paramDefaults.applyStageLength,
          config.paramDefaults.pApplyStageLength,
          config.paramDefaults.commitStageLength,
          config.paramDefaults.pCommitStageLength,
          config.paramDefaults.revealStageLength,
          config.paramDefaults.pRevealStageLength,
          config.paramDefaults.dispensationPct,
          config.paramDefaults.pDispensationPct,
          config.paramDefaults.voteQuorum,
          config.paramDefaults.pVoteQuorum,
        );

        // Approve Parameterizer to transfer tokens from hodlers.
        // TODO: Move this out of the migrations and into the tests
        const token = await Token.deployed();
        return Promise.all(
          config.token.tokenHolders.map(async tokenHolder =>
            token.approve(Parameterizer.address, tokenHolder.amount,
              { from: tokenHolder.address }),
          ),
        );
      })
    // Deploy TCR
      .then(async () => {
        // eslint-disable-next-line
        console.log('Deploying TCR');

        await deployer.link(DLL, Registry);
        await deployer.link(AttributeStore, Registry);

        await deployer.deploy(
          Registry,
          Token.address,
          PLCRVoting.address,
          Parameterizer.address,
          config.name,
        );

        // Approve Registry to transfer tokens from hodlers.
        // TODO: Move this out of the migrations and into the tests
        const token = await Token.deployed();
        return Promise.all(
          config.token.tokenHolders.map(async tokenHolder =>
            token.approve(Registry.address, tokenHolder.amount, { from: tokenHolder.address }),
          ),
        );
      })
      .catch((err) => { throw (err); });
  }
};

