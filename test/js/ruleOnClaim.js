/* eslint-env mocha */
/* global contract artifacts assert */

// TODO: Grab claimIds from events

const DelphiStake = artifacts.require('DelphiStake');

const utils = require('./utils.js');
const BN = require('bignumber.js');

contract('DelphiStake', (accounts) => {
  describe('Function: ruleOnClaim', () => {
    const [, claimant, arbiter, dave] = accounts;

    it('should revert if called by a non-arbiter', async () => {
      const ds = await DelphiStake.deployed();
      const claimAmount = '1';
      const feeAmount = '1';

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant, value: feeAmount });
      const claimId = (await ds.openClaims.call()).sub(new BN('1', 10));

      try {
        await utils.as(dave, ds.ruleOnClaim, claimId, true);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }

      assert.fail('A non-arbiter was able to rule on the claim');
    });

    it('should revert if the claim has already been ruled', async () => {
      const ds = await DelphiStake.deployed();
      const claimAmount = '1';
      const feeAmount = '1';

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant, value: feeAmount });
      const claimId = (await ds.openClaims.call()).sub(new BN('1', 10));

      await utils.as(arbiter, ds.ruleOnClaim, claimId, true);

      try {
        await utils.as(arbiter, ds.ruleOnClaim, claimId, false);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }

      assert.fail('A claim was able to be ruled on twice');
    });

    it('should properly set the claim\'s accepted status', async () => {
      const ds = await DelphiStake.deployed();
      const claimAmount = '1';
      const feeAmount = '1';

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant, value: feeAmount });

      const claimId = (await ds.openClaims.call()).sub(new BN('1', 10));

      await utils.as(arbiter, ds.ruleOnClaim, claimId, true);

      // TODO: Check update of actual claim struct property
    });

    it('should add the claim\'s amount and fee to the stake iff the claim is not accepted');
    it('should not alter the stake if the claim is accepted');
    it('should transfer the fee to the arbiter');
    it('should decrement openClaims');
    it('it should set lockupEnding to now + lockupRemaining iff openClaims is zero after ruling');
    it('should emit a ClaimRuled event');
  });
});

