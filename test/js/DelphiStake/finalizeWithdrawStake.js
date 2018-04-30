/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiStake = artifacts.require('DelphiStake');
const EIP20 = artifacts.require('EIP20');

const utils = require('../utils.js');
const BN = require('bignumber.js');

const conf = utils.getConfig();

const Web3 = require('web3');

const web3 = new Web3(Web3.givenProvider || 'ws://localhost:7545');

function sleep(milliseconds) {
  const start = new Date().getTime();
  for (let i = 0; i < 1e7; i += 1) {
    if ((new Date().getTime() - start) > milliseconds) {
      break;
    }
  }
}

contract('DelphiStake', (accounts) => {
  describe('Function: withdrawStake', () => {
    const [staker, claimant, arbiter] = accounts;
    it('should revert if called by any entity other than the staker', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });
      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.deadline, arbiter, { from: staker });

      try {
        await ds.withdrawStake({ from: claimant });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }

      assert(false, 'expected revert if called by any entity other than the staker');
    });
    it('should revert if called before the release time', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });
      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.deadline, arbiter, { from: staker });

      try {
        await ds.withdrawStake({ from: staker });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }

      assert(false, 'expected revert if called before the release time');
    });
    it('should revert if open claims remain', async () => {
      const timeBlock = await web3.eth.getBlock(await web3.eth.getBlockNumber());
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });
      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        timeBlock.timestamp + 3, arbiter, { from: staker });

      const claimAmount = new BN('1', 10);
      const feeAmount = new BN('10', 10);

      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.whitelistClaimant(claimant, timeBlock.timestamp + 30, { from: staker });

      await ds.openClaim(claimant, claimAmount, feeAmount, '', { from: claimant });
      sleep(8000);
      try {
        await ds.withdrawStake({ from: staker });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }

      assert(false, 'expected revert if open claims remain');
    });

    it('should set claimableStake to zero', async () => {
      const timeBlock = await web3.eth.getBlock(await web3.eth.getBlockNumber());
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });
      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        timeBlock.timestamp + 3, arbiter, { from: staker });
      // delay function
      for (let i = 0; i < 1000; i += 1) {
        token.transfer(claimant, 1, { from: staker });
      }
      sleep(4000);
      await ds.withdrawStake({ from: staker });
      const claimableStake = await ds.claimableStake();
      assert.strictEqual(claimableStake.toString(10), '0', 'claimableStake is not zero');
    });

    it('should transfer the old stake amount to the staker', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, 50, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });
      const timeBlock = await web3.eth.getBlock(await web3.eth.getBlockNumber());
      const tims = timeBlock.timestamp + 6;
      await ds.initDelphiStake(50, token.address, conf.minFee, conf.data,
        tims, arbiter, { from: staker });
      // delay function
      for (let i = 0; i < 1000; i += 1) {
        token.transfer(claimant, 1, { from: staker });
      }
      sleep(10000);
      await ds.withdrawStake({ from: staker });
      const stakerCurrentBalance = await token.balanceOf(staker);
      assert.strictEqual(stakerCurrentBalance.toString(10), '898000',
        'claimableStake doesnt withdraw correctly');
    });

    it('should emit a StakeWithdrawn event', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });
      const timeBlock = await web3.eth.getBlock(await web3.eth.getBlockNumber());
      const tims = timeBlock.timestamp + 6;
      await ds.initDelphiStake(50, token.address, conf.minFee, conf.data,
        tims, arbiter, { from: staker });
      // delay function
      for (let i = 0; i < 1000; i += 1) {
        token.transfer(claimant, 1, { from: staker });
      }
      sleep(10000);
      await ds.withdrawStake({ from: staker }).then((status) => {
        assert.strictEqual('StakeWithdrawn', status.logs[0].event,
          'did not emit the StakeWithdrawn event');
      });
    });
  });
});
