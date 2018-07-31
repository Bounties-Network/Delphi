/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiStake = artifacts.require('DelphiStake');

const EIP20 = artifacts.require('EIP20');

const utils = require('../utils.js');

const BN = require('bignumber.js');

const conf = utils.getConfig();

contract('DelphiStake', (accounts) => {
  describe('Function: settlementFailed', () => {
    const [staker, claimant, arbiter, other] = accounts;

    let ds;
    let token;

    beforeEach(async () => {
      token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });

      await ds.initDelphiStake(staker, conf.initialStake, token.address, conf.data,
        conf.deadline, { from: staker });

      const claimAmount = new BN('1', 10);
      const feeAmount = new BN('10', 10);

      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.whitelistClaimant(claimant, arbiter, feeAmount, conf.deadline, "", { from: staker });

      await ds.openClaim(0, claimAmount, feeAmount, '', { from: claimant });
    });

    it('should revert if called with an out-of-bounds claimId', async () => {
      try {
        await ds.settlementFailed(1, "", { from: staker });
      } catch (err) {
        return;
      }
      assert(false, 'expected revert if called with an out-of-bounds claimId');
    });

    it('should revert if called by anyone but the staker or the claimant corresponding to the claimId', async () => {
      try {
        await ds.settlementFailed(0, "", { from: other });
      } catch (err) {
        return;
      }
      assert(false, 'expected revert if called by anyone but the staker or the claimant corresponding to the claimId');
    });

    it('should revert if settlement has already failed', async () => {
      await ds.settlementFailed(0, "", { from: claimant });
      try {
        await ds.settlementFailed(0, "", { from: claimant });
      } catch (err) {
        return;
      }
      assert(false, 'expected revert if settlement has already failed ');
    });
    it('should emit the SettlementFailed event', async () => {
      await ds.settlementFailed(0, "", { from: claimant }).then((status) => {
        assert.strictEqual('SettlementFailed', status.logs[0].event, 'did not emit the SettlementFailed event');
      });
    });
  });
});
