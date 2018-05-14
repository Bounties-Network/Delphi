/* eslint-env mocha */
/* global contract artifacts assert */

// TODO: Grab claimIds from events

const DelphiStake = artifacts.require('DelphiStake');
const EIP20 = artifacts.require('EIP20');

const utils = require('../utils.js');
const BN = require('bignumber.js');


const conf = utils.getConfig();


contract('DelphiStake', (accounts) => {
  describe('Function: ruleOnClaim', () => {
    const [staker, claimant, arbiter, other] = accounts;

    const claimAmount = '1';
    const defaultRuling = '1';

    let token;
    let ds;

    let originalArbiterBalance;
    let originalClaimantBalance;

    beforeEach(async () => {
      // Create a new token, apportioning shares to the staker, claimant, and arbiter
      token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      // Create a new DelphiStake
      ds = await DelphiStake.new();

      // Initialize the DelphiStake (it will need to transferFrom the staker, so approve it first)
      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.deadline, arbiter, { from: staker });

      await token.approve(ds.address, conf.minFee, { from: claimant });

      await ds.whitelistClaimant(claimant, conf.deadline, { from: staker });

      await ds.openClaim(claimAmount, conf.minFee, '', { from: claimant });

      await ds.settlementFailed('0', { from: claimant });

      originalArbiterBalance = await token.balanceOf(arbiter);
      originalClaimantBalance = await token.balanceOf(claimant);
    });

    it('should revert if called by a non-arbiter', async () => {
      try {
        await utils.as(other, ds.ruleOnClaim, '0', defaultRuling);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }

      assert(false, 'A non-arbiter was able to rule on the claim');
    });
    it('should revert if called on an out-of-bounds claimId', async () => {
      try {
        await utils.as(arbiter, ds.ruleOnClaim, 1, defaultRuling);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }
      assert(false, 'expected revert if called on an out-of-bounds claimId');
    });

    it('should revert if called on an out-of-bounds ruling', async () => {
      try {
        await utils.as(arbiter, ds.ruleOnClaim, '0', 6);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }

      assert(false, 'expected revert if called on an out-of-bounds claimId');
    });

    it('should revert if settlement never failed', async () => {
      await token.approve(ds.address, conf.minFee, { from: claimant });
      await ds.openClaim(claimAmount, conf.minFee, '', { from: claimant });

      try {
        await utils.as(arbiter, ds.ruleOnClaim, 1, defaultRuling);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }
      assert(false, 'did not revert after trying to rule on a claim whose settlement has not yet failed');
    });

    it('should revert if the claim has already been ruled', async () => {
      await utils.as(arbiter, ds.ruleOnClaim, '0', defaultRuling);

      try {
        await utils.as(arbiter, ds.ruleOnClaim, '0', defaultRuling);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }

      assert(false, 'A claim was able to be ruled on twice');
    });

    it('should properly set the claim\'s ruling', async () => {
      await utils.as(arbiter, ds.ruleOnClaim, '0', defaultRuling);

      const claim = await ds.claims.call('0');

      assert.strictEqual(claim[5].toString(10), defaultRuling, 'initialized claim ruling incorrectly');
    });

    it('should add the claim\'s amount and fee to the stake iff the claim is not accepted', async () => {
      await ds.ruleOnClaim('0', defaultRuling, { from: arbiter });
      const stake = await ds.claimableStake.call();
      assert.strictEqual(stake.toString(10), conf.initialStake, 'stake not returned to original amount');
    });

    it('should not alter the stake if the claim is accepted', async () => {
      await ds.ruleOnClaim('0', defaultRuling, { from: arbiter });

      const stakeAfterRuling = await ds.claimableStake.call();

      assert.strictEqual(conf.initialStake, stakeAfterRuling.toString(10),
        'stake incorrectly changed after ruling');
    });

    it('should transfer the fee and surplus to the arbiter and the claim amount + fee to the claimant if the ruling is 0', async () => {
      const ruling = '0';

      await ds.ruleOnClaim('0', ruling, { from: arbiter });

      const arbiterBalance = await token.balanceOf(arbiter);
      const claimantBalance = await token.balanceOf(claimant);

      assert.strictEqual(originalArbiterBalance.add(new BN(conf.minFee, 10)).toString(10), arbiterBalance.toString(10), 'Arbiter Balance doesnt grow up');
      assert.strictEqual(originalClaimantBalance.add(new BN(parseInt(conf.minFee, 10) + parseInt(claimAmount, 10), 10)).toString(10), claimantBalance.toString(10), 'Claimant Balance doesnt grow up');
    });

    it('should transfer the fee and surplus to the arbiter and return the claim amount + fee to the stakers stake if the ruling is 1', async () => {
      const ruling = '1';

      await ds.ruleOnClaim('0', ruling, { from: arbiter });

      const arbiterBalance = await token.balanceOf(arbiter);
      const stake = await ds.claimableStake.call();

      assert.strictEqual(originalArbiterBalance.add(new BN(conf.minFee, 10)).toString(10), arbiterBalance.toString(10), 'Arbiter Balance doesnt grow up');
      assert.strictEqual(stake.toString(10), conf.initialStake, 'stake not returned to original amount');
    });

    it('should transfer 2 times the fee plus the surplus to the arbiter and should burn the claim amount if the ruling is 2', async () => {
      const ruling = '2';

      await ds.ruleOnClaim('0', ruling, { from: arbiter });

      const arbiterBalance = await token.balanceOf(arbiter);

      assert.strictEqual(originalArbiterBalance.add(new BN(parseInt(conf.minFee, 10) * 2, 10)).toString(10), arbiterBalance.toString(10), 'Arbiter balance incorrect');

      const balance0x0 = await token.balanceOf('0x0000000000000000000000000000000000000000');

      assert.strictEqual(balance0x0.toString(10), claimAmount, 'address 0x0 balance incorrect');
    });

    it('should transfer the fee deposit back to the claimant, transfer the fee surplus to the arbiter, and return the claim amount and fee to the stakers stake', async () => {
      const ruling = '3';

      await ds.ruleOnClaim('0', ruling, { from: arbiter });

      // const arbiterBalance = await token.balanceOf(arbiter);
      const stake = await ds.claimableStake.call();
      const claimantBalance = await token.balanceOf(claimant);

      assert.strictEqual(stake.toString(10), conf.initialStake, 'stake not returned to original amount');
      assert.strictEqual(originalClaimantBalance.add(
        new BN(parseInt(conf.minFee, 10) + parseInt(claimAmount, 10), 10))
        .toString(10), claimantBalance.toString(10), 'Incorrect claimant balance');
    });

    it('should decrement openClaims', async () => {
      // Open a new claim
      await ds.whitelistClaimant(claimant, conf.deadline, { from: staker });
      await token.approve(ds.address, conf.minFee, { from: claimant });
      const { logs } = await ds.openClaim(claimAmount, conf.minFee, '', { from: claimant });
      const claimId = utils.getLog(logs, 'ClaimOpened').args._claimId; // eslint-disable-line

      // Get the initial number of open claims
      const initialOpenClaims = await ds.openClaims.call();

      // Cancel settlement and rule on the claim
      await ds.settlementFailed(claimId, { from: claimant });
      await ds.ruleOnClaim(claimId, defaultRuling, { from: arbiter });

      // Since the claim is closed now, expect openClaims to be less than it was before we closed
      // the claim.
      const finalOpenClaims = await ds.openClaims.call();
      assert(finalOpenClaims.lt(initialOpenClaims), 'openClaims not decremented after ruling');
    });

    it('should emit a ClaimRuled event', async () => {
      // Open a new claim
      await ds.whitelistClaimant(claimant, conf.deadline, { from: staker });
      await token.approve(ds.address, conf.minFee, { from: claimant });
      const openClaimLogs
        = (await ds.openClaim(claimAmount, conf.minFee, '', { from: claimant })).logs;
      const claimId =
        utils.getLog(openClaimLogs, 'ClaimOpened').args._claimId; // eslint-disable-line

      // Cancel settlement and rule on claim. Capture the logs on ruling.
      await ds.settlementFailed(claimId, { from: claimant });
      const ruledLogs = (await ds.ruleOnClaim(claimId, defaultRuling, { from: arbiter })).logs;

      // Expect utils.getLog to find in the logs returned in openClaim a 'ClaimOpened' event
      assert(typeof utils.getLog(ruledLogs, 'ClaimRuled') !== 'undefined',
        'An expected log was not emitted');

      // Expect the ClaimRuled log to have a valid claimId argument
      assert.strictEqual(
        utils.getLog(ruledLogs, 'ClaimRuled').args._claimId.toString(10), // eslint-disable-line
        '1',
        'The event either did not contain a _claimId arg, or the emitted claimId was incorrect');
    });
  });
});
