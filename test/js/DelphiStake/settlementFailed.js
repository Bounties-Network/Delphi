/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiStake = artifacts.require('DelphiStake');

const EIP20 = artifacts.require('EIP20');

const utils = require('../utils.js');

const BN = require('bignumber.js');

const conf = utils.getConfig();

contract('DelphiStake', (accounts) => {
  describe('Function: settlementFailed', () => {
    const [staker, claimant, arbiter, thirdPary] = accounts;
    it('should revert if called with an out-of-bounds claimId', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.deadline, arbiter, { from: staker });

      const claimAmount = new BN('1', 10);
      const feeAmount = new BN('10', 10);

      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.whitelistClaimant(claimant, conf.deadline, { from: staker });

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant });
      try {
        await ds.settlementFailed(3, { from: staker });
      } catch (err) {
        return;
      }
      assert(false, 'expected revert if called with an out-of-bounds claimId');
    });
    it('should revert if called by anyone but the staker or the claimant corresponding to the claimId', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.deadline, arbiter, { from: staker });

      const claimAmount = new BN('1', 10);
      const feeAmount = new BN('10', 10);

      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.whitelistClaimant(claimant, conf.deadline, { from: staker });

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant });
      try {
        await ds.settlementFailed(0, { from: thirdPary });
      } catch (err) {
        return;
      }
      assert(false, 'expected revert if called by anyone but the staker or the claimant corresponding to the claimId');
    });
    it('should revert if settlement has already failed', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.deadline, arbiter, { from: staker });

      const claimAmount = new BN('1', 10);
      const feeAmount = new BN('10', 10);

      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.whitelistClaimant(claimant, conf.deadline, { from: staker });

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant });
      await ds.settlementFailed(0, { from: claimant });
      try {
        await ds.settlementFailed(0, { from: claimant });
      } catch (err) {
        return;
      }
      assert(false, 'expected revert if settlement has already failed ');
    });
    it('should emit the SettlementFailed event', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.deadline, arbiter, { from: staker });

      const claimAmount = new BN('1', 10);
      const feeAmount = new BN('10', 10);

      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.whitelistClaimant(claimant, conf.deadline, { from: staker });

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant });

      await ds.settlementFailed(0, { from: claimant }).then((status) => {
        assert.strictEqual('SettlementFailed', status.logs[0].event, 'did not emit the SettlementFailed event');
      });
    });
  });
});
