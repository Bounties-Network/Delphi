/* global artifacts */

const Registry = artifacts.require('Registry.sol');
const DelphiStake = artifacts.require('DelphiStake.sol');
const DelphiStakeFactory = artifacts.require('DelphiStakeFactory');
const EIP20 = artifacts.require('tokens/eip20/EIP20.sol');

const HttpProvider = require('ethjs-provider-http');
const EthRPC = require('ethjs-rpc');
const fs = require('fs');
const abi = require('ethereumjs-abi');
const BN = require('bignumber.js');

const ethRPC = new EthRPC(new HttpProvider('http://localhost:7545'));

const config = JSON.parse(fs.readFileSync('./conf/tcrConfig.json'));
const delphiConfig = JSON.parse(fs.readFileSync('./conf/dsConfig.json'));

const utils = {

  initDelphiStake: async (staker, arbiter) => {
    const ds = await DelphiStake.deployed();
    const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
    await token.approve(ds.address, delphiConfig.initialStake, { from: staker });

    await ds.initDelphiStake(delphiConfig.initialStake, token.address,
      delphiConfig.minFee, delphiConfig.data, delphiConfig.deadline,
      arbiter, { from: staker });
  },

  makeNewClaim: async (staker, claimant, amount, fee, data) => {
    const df = await DelphiStakeFactory.deployed();
    const ds = await DelphiStake.at( await df.stakes.call('0') );

    const token = EIP20.at(await ds.token.call());

    await utils.as(staker, ds.whitelistClaimant, claimant, delphiConfig.deadline);

    await utils.as(claimant, token.approve, ds.address, new BN(amount, 10).plus(new BN(fee, 10)));
    await utils.as(claimant, ds.openClaim, amount, fee, data);

    const claimId = await ds.getNumClaims();

    await utils.as(claimant, ds.settlementFailed, claimId.sub(1));

    return claimId.sub(1);
  },

  addToWhitelist: async (listingHash, deposit, actor) => {
    const registry = await Registry.deployed();

    await utils.as(actor, registry.apply, listingHash, deposit, '');
    await utils.increaseTime(config.paramDefaults.applyStageLength + 1);
    await utils.as(actor, registry.updateStatus, listingHash);
  },

  getClaimId: (stake, claimNumber) => (
    `0x${abi.soliditySHA3(['address', 'uint'], [stake, claimNumber]).toString('hex')}`
  ),

  getArbiterListingId: arbiter => (
    `0x${abi.soliditySHA3(['address'], [arbiter]).toString('hex')}`
  ),

  getSecretHash: (vote, salt) => (
    `0x${abi.soliditySHA3(['uint', 'uint'], [vote, salt]).toString('hex')}`
  ),

  increaseTime: async seconds =>
    new Promise((resolve, reject) => ethRPC.sendAsync({
      method: 'evm_increaseTime',
      params: [seconds],
    }, (err) => {
      if (err) reject(err);
      resolve();
    }))
      .then(() => new Promise((resolve, reject) => ethRPC.sendAsync({
        method: 'evm_mine',
        params: [],
      }, (err) => {
        if (err) reject(err);
        resolve();
      }))),

  as: (actor, fn, ...args) => {
    function detectSendObject(potentialSendObj) {
      function hasOwnProperty(obj, prop) {
        const proto = obj.constructor.prototype;
        return (prop in obj) &&
          (!(prop in proto) || proto[prop] !== obj[prop]);
      }
      if (typeof potentialSendObj !== 'object') { return; }
      if (
        hasOwnProperty(potentialSendObj, 'from') ||
        hasOwnProperty(potentialSendObj, 'to') ||
        hasOwnProperty(potentialSendObj, 'gas') ||
        hasOwnProperty(potentialSendObj, 'gasPrice') ||
        hasOwnProperty(potentialSendObj, 'value')
      ) {
        throw new Error('It is unsafe to use "as" with custom send objects');
      }
    }
    detectSendObject(args[args.length - 1]);
    const sendObject = { from: actor };
    return fn(...args, sendObject);
  },

  isEVMException: err => (
    err.toString().includes('invalid opcode')
  ),

  isEVMRevert: err => (
    err.toString().includes('revert')
  ),

  getConfig: () => JSON.parse(fs.readFileSync('conf/dsConfig.json')),

  getLog: (logs, event) => logs.find(log => log.event.includes(event)),

};


module.exports = utils;
