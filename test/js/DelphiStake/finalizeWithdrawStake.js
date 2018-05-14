/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiStake = artifacts.require('DelphiStake');
const EIP20 = artifacts.require('EIP20');

const utils = require('../utils.js');
const BN = require('bignumber.js');

const conf = utils.getConfig();

const Web3 = require('web3');

const web3 = new Web3(Web3.givenProvider || 'ws://localhost:7545');


contract('DelphiStake', (accounts) => {
  describe('Function: withdrawStake', () => {
    const [staker, claimant, arbiter] = accounts;

    let ds;
    let token;

    beforeEach(async () => {
      token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await utils.as(staker, token.transfer, claimant, 100000);

      ds = await DelphiStake.new();

      await utils.as(staker, token.approve, ds.address, conf.initialStake);

      await utils.as(staker, token.transfer, arbiter, 1000);

      const timeBlock = await web3.eth.getBlock(await web3.eth.getBlockNumber());
      const tims = timeBlock.timestamp + 6;

      await utils.as(staker, ds.initDelphiStake, conf.initialStake, token.address,
        conf.minFee, conf.data, tims, arbiter);
    });

    it('should revert if called by any entity other than the staker', async () => {
      try {
        await utils.as(claimant, ds.withdrawStake);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }

      assert(false, 'expected revert if called by any entity other than the staker');
    });
    it('should revert if called before the release time', async () => {
      try {
        await utils.as(staker, ds.withdrawStake);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }

      assert(false, 'expected revert if called before the release time');
    });
    it('should revert if open claims remain', async () => {
      const timeBlock = await web3.eth.getBlock(await web3.eth.getBlockNumber());

      const claimAmount = new BN('1', 10);
      const feeAmount = new BN('10', 10);

      await utils.as(claimant, token.approve, ds.address, feeAmount);

      await utils.as(staker, ds.whitelistClaimant, claimant, timeBlock.timestamp + 30);

      await utils.as(claimant, ds.openClaim, claimAmount, feeAmount, '');

      await utils.increaseTime(8000);
      try {
        await utils.as(staker, ds.withdrawStake);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }

      assert(false, 'expected revert if open claims remain');
    });

    it('should set claimableStake to zero', async () => {
      await utils.increaseTime(5000);
      await utils.as(staker, ds.withdrawStake);
      const claimableStake = await ds.claimableStake();
      assert.strictEqual(claimableStake.toString(10), '0', 'claimableStake is not zero');
    });

    it('should transfer the old stake amount to the staker', async () => {
      await utils.increaseTime(10000);
      await utils.as(staker, ds.withdrawStake);
      const stakerCurrentBalance = await token.balanceOf(staker);
      assert.strictEqual(stakerCurrentBalance.toString(10), '899000',
        'claimableStake doesnt withdraw correctly');
    });

    it('should emit a StakeWithdrawn event', async () => {
      await utils.increaseTime(10000);

      await ds.withdrawStake({ from: staker }).then((status) => {
        assert.strictEqual('StakeWithdrawn', status.logs[0].event,
          'did not emit the StakeWithdrawn event');
      });
    });
  });
});
