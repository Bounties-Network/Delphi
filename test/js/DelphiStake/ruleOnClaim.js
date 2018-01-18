/* eslint-env mocha */
/* global contract artifacts assert */

// TODO: Grab claimIds from events

const DelphiStake = artifacts.require('DelphiStake');

const utils = require('../utils.js');
const BN = require('bignumber.js');

const conf = utils.getConfig();


contract('DelphiStake', (accounts) => {
  describe('Function: ruleOnClaim', () => {
    const [staker, claimant, arbiter, dave] = accounts;

    it('should revert if called by a non-arbiter', async () => {
      const ds = await DelphiStake.deployed();
      const claimAmount = '1';
      const feeAmount = '1';
      const ruling = '1';

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant, value: feeAmount });
      const claimId = (await ds.openClaims.call()).sub(new BN('1', 10));

      await ds.settlementFailed(claimId, { from: claimant });

      try {
        await utils.as(dave, ds.ruleOnClaim, claimId, ruling);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }

      assert(false, 'A non-arbiter was able to rule on the claim');
    });

    it('should revert if settlement never failed', async () => {
      const ds = await DelphiStake.deployed();
      const claimAmount = '1';
      const feeAmount = '1';
      const ruling = '1';

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant, value: feeAmount });
      const claimId = (await ds.openClaims.call()).sub(new BN('1', 10));

      try {
        await utils.as(arbiter, ds.ruleOnClaim, claimId, ruling);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }
    });

    it('should revert if the claim has already been ruled', async () => {
      const ds = await DelphiStake.new(conf.initialStake, conf.stakeTokenAddr, conf.data,
        conf.lockupPeriod, arbiter, { from: staker, value: conf.initialStake });
      const claimAmount = '1';
      const feeAmount = '1';
      const ruling = '1';
      const claimId = '0';

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant, value: feeAmount });
      await ds.settlementFailed(claimId, { from: claimant });

      await ds.ruleOnClaim(claimId, ruling, { from: arbiter });

      try {
        await utils.as(arbiter, ds.ruleOnClaim, claimId, ruling);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }

      assert(false, 'A claim was able to be ruled on twice');
    });

    it('should properly set the claim\'s ruling', async () => {
      const ds = await DelphiStake.new(conf.initialStake, conf.stakeTokenAddr, conf.data,
        conf.lockupPeriod, arbiter, { from: staker, value: conf.initialStake });
      const claimAmount = '1';
      const feeAmount = '1';
      const ruling = '1';
      const claimId = '0';


      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant, value: feeAmount });
      await ds.settlementFailed(claimId, { from: claimant });

      await utils.as(arbiter, ds.ruleOnClaim, '0', ruling);

      const claim = await ds.claims.call('0');

      assert.strictEqual(claim[5].toString(10), '1', 'initialized claim ruling incorrectly');

    });

    it('should add the claim\'s amount and fee to the stake iff the claim is not accepted', async () => {
      const ds = await DelphiStake.new(conf.initialStake, conf.stakeTokenAddr, conf.data,
        conf.lockupPeriod, arbiter, { from: staker, value: conf.initialStake });
      const claimAmount = '1';
      const feeAmount = '1';
      const ruling = '1';
      const claimId = '0';

      const stakeBeforeClaim = await ds.stake.call();

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant, value: feeAmount });
      await ds.settlementFailed(claimId, { from: claimant });

      await utils.as(arbiter, ds.ruleOnClaim, '0', ruling);

      const claim = await ds.claims.call('0');

      assert.strictEqual(claim[5].toString(10), '1', 'initialized claim ruling incorrectly');

    });

    it('should not alter the stake if the claim is accepted', async () => {
      const ds = await DelphiStake.new(conf.initialStake, conf.stakeTokenAddr, conf.data,
        conf.lockupPeriod, arbiter, { from: staker, value: conf.initialStake });
      const claimAmount = '1';
      const feeAmount = '1';
      const ruling = '0';
      const claimId = '0';

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant, value: feeAmount });

      const stakeBeforeRuling = await ds.stake.call();

      await ds.settlementFailed(claimId, { from: claimant });

      await utils.as(arbiter, ds.ruleOnClaim, '0', ruling);

      const stakeAfterClaim = await ds.stake.call();

      assert.strictEqual(stakeBeforeRuling.toString(10), stakeAfterClaim.toString(10),
        'stake incorrectly changed after ruling');
    });

    it('should transfer the fee to the arbiter', async () => {
      const ds = await DelphiStake.new(conf.initialStake, conf.stakeTokenAddr, conf.data,
        conf.lockupPeriod, arbiter, { from: staker, value: conf.initialStake });
      const claimAmount = '1';
      const feeAmount = '1';
      const ruling = '0';
      const claimId = '0';

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant, value: feeAmount });


      await ds.settlementFailed(claimId, { from: claimant });

      const balanceBeforeRuling = await web3.eth.getBalance(arbiter);

      await utils.as(arbiter, ds.ruleOnClaim, '0', ruling);

      const balanceAfterRuling = await web3.eth.getBalance(arbiter);

      assert.strictEqual(balanceBeforeRuling.add(feeAmount).toString(10), balanceAfterRuling.toString(10),
        'fee not paid to the arbiter');
    });

    it('should decrement openClaims');

    it('it should set lockupEnding to now + lockupRemaining iff openClaims is zero after ruling');

    it('should emit a ClaimRuled event');
  });
});
