/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiStake = artifacts.require('DelphiStake');
const EIP20 = artifacts.require('EIP20');

const utils = require('../utils.js');
const BN = require('bignumber.js');

const conf = utils.getConfig();

contract('DelphiStake', (accounts) => {
  describe('Function: increaseClaimFee', () => {
    const [staker, claimant, arbiter] = accounts;

    let ds;
    let token;

    beforeEach(async () => {
      token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.deadline, arbiter, { from: staker });

      const claimAmount = new BN('1', 10);
      const feeAmount = new BN('10', 10);

      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.whitelistClaimant(claimant, conf.deadline, { from: staker });

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant });
    });

    it('should revert if called with an out-of-bounds claimId', async () => {
      try {
        await utils.as(arbiter, ds.increaseClaimFee, 3, 11);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }

      assert(false, 'expected revert if called with an out-of-bounds claimId');
    });

    it('should revert if called on a claim which has already been ruled upon', async () => {
      await ds.settlementFailed(0, { from: claimant });
      await ds.ruleOnClaim(0, '0', { from: arbiter });

      try {
        await utils.as(arbiter, ds.increaseClaimFee, 0, 2);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }
      assert(false, 'expected revert if called on a claim which has already been ruled upon');
    });

    it('should revert if settlement has not yet failed', async () => {
      try {
        await utils.as(arbiter, ds.increaseClaimFee, 0, 11);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }

      assert(false, 'expected revert if settlement has not yet failed');
    });

    it('should transfer the increase _amount from the sender to the contract', async () => {
      assert.strictEqual((await token.balanceOf(ds.address)).toString(10), '110', 'claim surplus fee incorrectly');

      await ds.settlementFailed(0, { from: staker });

      await token.approve(ds.address, 1, { from: staker });
      await ds.increaseClaimFee(0, 1, { from: staker });

      assert.strictEqual((await token.balanceOf(ds.address)).toString(10), '111', 'claim surplus fee incorrectly');
    });

    it('should increase the surplus fee by the _amount', async () => {
      await ds.settlementFailed(0, { from: staker });

      await token.approve(ds.address, 1, { from: staker });
      await ds.increaseClaimFee(0, 1, { from: staker });

      const claim1 = await ds.claims.call('0');
      assert.strictEqual(claim1[3].toString(10), '1', 'claim surplus fee incorrectly');
    });

    it('should emit a FeeIncreased event', async () => {
      await ds.settlementFailed(0, { from: staker });

      await token.approve(ds.address, 1, { from: staker });
      await ds.increaseClaimFee(0, 1, { from: staker }).then((status) => {
        assert.strictEqual('FeeIncreased', status.logs[0].event, 'did not emit the FeeIncreased event');
      });
    });
  });
});
