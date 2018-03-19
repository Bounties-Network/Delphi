/* eslint-env mocha */
/* global contract artifacts assert */

// TODO: Grab claimIds from events

const DelphiStake = artifacts.require('DelphiStake');
const EIP20 = artifacts.require('EIP20');


const utils = require('../utils.js');

const conf = utils.getConfig();


contract('DelphiStake', (accounts) => {
  describe('Function: ruleOnClaim', () => {
    const [staker, claimant, arbiter, dave] = accounts;

    it('should revert if called by a non-arbiter', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.lockupPeriod, arbiter, { from: staker });

      const claimAmount = '1';
      const feeAmount = '10';
      const ruling = '1';

      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.whitelistClaimant(claimant, { from: staker });

      const claimId = await ds.getNumClaims();

      await ds.openClaim(claimant, claimAmount, feeAmount, '', { from: claimant });

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
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.lockupPeriod, arbiter, { from: staker });

      const claimAmount = '1';
      const feeAmount = '10';
      const ruling = '1';

      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.whitelistClaimant(claimant, { from: staker });

      const claimId = await ds.getNumClaims();

      await ds.openClaim(claimant, claimAmount, feeAmount, '', { from: claimant });

      try {
        await utils.as(arbiter, ds.ruleOnClaim, claimId, ruling);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }
      assert(false, 'did not revert after trying to rule on a claim whose settlement has not yet failed');
    });

    it('should revert if the claim has already been ruled', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.lockupPeriod, arbiter, { from: staker });

      const claimAmount = '1';
      const feeAmount = '10';
      const ruling = '1';

      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.whitelistClaimant(claimant, { from: staker });

      const claimId = await ds.getNumClaims();

      await ds.openClaim(claimant, claimAmount, feeAmount, '', { from: claimant });

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
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.lockupPeriod, arbiter, { from: staker });

      const claimAmount = '1';
      const feeAmount = '10';
      const ruling = '1';

      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.whitelistClaimant(claimant, { from: staker });

      const claimId = await ds.getNumClaims();

      await ds.openClaim(claimant, claimAmount, feeAmount, '', { from: claimant });

      await ds.settlementFailed(claimId, { from: claimant });

      await ds.ruleOnClaim(claimId, ruling, { from: arbiter });

      const claim = await ds.claims.call('0');

      assert.strictEqual(claim[5].toString(10), '1', 'initialized claim ruling incorrectly');
    });

    it('should add the claim\'s amount and fee to the stake iff the claim is not accepted', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.lockupPeriod, arbiter, { from: staker });

      const claimAmount = '1';
      const feeAmount = '10';
      const ruling = '1';

      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.whitelistClaimant(claimant, { from: staker });

      const claimId = await ds.getNumClaims();

      await ds.openClaim(claimant, claimAmount, feeAmount, '', { from: claimant });

      await ds.settlementFailed(claimId, { from: claimant });

      await ds.ruleOnClaim(claimId, ruling, { from: arbiter });

      const newStake = await ds.claimableStake.call();

      assert.strictEqual(newStake.toString(10), conf.initialStake, 'stake not returned to original amount');
    });

    it('should not alter the stake if the claim is accepted', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.lockupPeriod, arbiter, { from: staker });

      const claimAmount = '1';
      const feeAmount = '10';
      const ruling = '0';

      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.whitelistClaimant(claimant, { from: staker });

      const claimId = await ds.getNumClaims();

      await ds.openClaim(claimant, claimAmount, feeAmount, '', { from: claimant });

      await ds.settlementFailed(claimId, { from: claimant });

      const stakeBeforeRuling = await ds.claimableStake.call();


      await ds.ruleOnClaim(claimId, ruling, { from: arbiter });

      const stakeAfterRuling = await ds.claimableStake.call();

      assert.strictEqual(stakeBeforeRuling.toString(10), stakeAfterRuling.toString(10),
        'stake incorrectly changed after ruling');
    });

    it('should transfer the fee to the arbiter', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.lockupPeriod, arbiter, { from: staker });

      const claimAmount = '1';
      const feeAmount = '10';
      const ruling = '1';

      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.whitelistClaimant(claimant, { from: staker });

      const claimId = await ds.getNumClaims();

      await ds.openClaim(claimant, claimAmount, feeAmount, '', { from: claimant });

      await ds.settlementFailed(claimId, { from: claimant });

      const balanceBeforeRuling = await token.balanceOf(arbiter);

      await ds.ruleOnClaim(claimId, ruling, { from: arbiter });

      const balanceAfterRuling = await token.balanceOf(arbiter);

      assert.strictEqual(balanceBeforeRuling.add(feeAmount).toString(10),
        balanceAfterRuling.toString(10), 'fee not paid to the arbiter');
    });

    it('should decrement openClaims');

    it('it should set lockupEnding to now + lockupRemaining iff openClaims is zero after ruling');

    it('should emit a ClaimRuled event');
  });
});
