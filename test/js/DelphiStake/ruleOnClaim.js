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

    let token;
    let ds;

    beforeEach(async () => {
      // Create a new token, apportioning shares to the staker, claimant, and arbiter
      token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      // Create a new DelphiStake
      ds = await DelphiStake.new();

      // Initialize the DelphiStake (it will need to transferFrom the staker, so approve it first)
      await token.approve(ds.address, conf.initialStake, { from: staker });
      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.deadline, arbiter, { from: staker });
    });

    it('should revert if called by a non-arbiter', async () => {
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
    it('should revert if called on an out-of-bounds claimId');

    it('should revert if called on an out-of-bounds _ruling');

    it('should revert if settlement never failed', async () => {
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

    it('should transfer the fee and surplus to the arbiter and the claim amount + fee to the claimant if the ruling is 0');
    it('should transfer the fee and surplus to the arbiter and return the claim amount + fee to the stakers stake if the ruling is 1');
    it('should transfer 2 times the fee plus the surplus to the arbiter and should burn the claim amount if the ruling is 2');
    it('should transfer the fee deposit back to the claimant, transfer the fee surplus to the arbiter, and return the claim amount and fee to the stakers stake');


    it('should decrement openClaims', async () => {
      const claimAmount = '1';
      const feeAmount = '10';
      const ruling = '1';

      // Open a new claim
      await ds.whitelistClaimant(claimant, { from: staker });
      await token.approve(ds.address, feeAmount, { from: claimant });
      const { logs } = await ds.openClaim(claimant, claimAmount, feeAmount, '', { from: claimant });
      const claimId = utils.getLog(logs, 'ClaimOpened').args._claimId; // eslint-disable-line

      // Get the initial number of open claims
      const initialOpenClaims = await ds.openClaims.call();

      // Cancel settlement and rule on the claim
      await ds.settlementFailed(claimId, { from: claimant });
      await ds.ruleOnClaim(claimId, ruling, { from: arbiter });

      // Since the claim is closed now, expect openClaims to be less than it was before we closed
      // the claim.
      const finalOpenClaims = await ds.openClaims.call();
      assert(finalOpenClaims.lt(initialOpenClaims), 'openClaims not decremented after ruling');
    });

    it('should emit a ClaimRuled event', async () => {
      const claimAmount = '1';
      const feeAmount = '10';
      const ruling = '1';

      // Open a new claim
      await ds.whitelistClaimant(claimant, { from: staker });
      await token.approve(ds.address, feeAmount, { from: claimant });
      const openClaimLogs
        = (await ds.openClaim(claimant, claimAmount, feeAmount, '', { from: claimant })).logs;
      const claimId =
        utils.getLog(openClaimLogs, 'ClaimOpened').args._claimId; // eslint-disable-line

      // Cancel settlement and rule on claim. Capture the logs on ruling.
      await ds.settlementFailed(claimId, { from: claimant });
      const ruledLogs = (await ds.ruleOnClaim(claimId, ruling, { from: arbiter })).logs;

      // Expect utils.getLog to find in the logs returned in openClaim a 'ClaimOpened' event
      assert(typeof utils.getLog(ruledLogs, 'ClaimRuled') !== 'undefined',
        'An expected log was not emitted');

      // Expect the ClaimRuled log to have a valid claimId argument
      assert.strictEqual(
        utils.getLog(ruledLogs, 'ClaimRuled').args._claimId.toString(10), // eslint-disable-line
        '0',
        'The event either did not contain a _claimId arg, or the emitted claimId was incorrect');
    });
  });
});
