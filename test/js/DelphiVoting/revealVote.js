/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiVoting = artifacts.require('DelphiVoting');
const DelphiStake = artifacts.require('DelphiStake');

const utils = require('../utils.js');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./conf/registryConfig.json'));

contract('DelphiVoting', (accounts) => {
  describe('Function: revealVote', () => {
    const [staker, claimant, arbiter] = accounts;

    before(async () => {
      // Add an arbiter to the whitelist
      await utils.addToWhitelist(utils.getArbiterListingId(arbiter),
        config.paramDefaults.minDeposit, arbiter);
    });

    it('should reveal an arbiter\'s vote and update the vote tally', async () => {
      const dv = await DelphiVoting.deployed();
      const ds = await DelphiStake.deployed();

      // Set constants
      const CLAIM_AMOUNT = '10';
      const FEE_AMOUNT = '10';
      const VOTE = '1';
      const SALT = '420';
      const DATA = 'i love cats';

      // Open a new claim on the DS and generate a claim ID for it
      const claimNumber = // should be zero
        await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, DATA);
      const claimId = utils.getClaimId(ds.address, claimNumber.toString(10));

      // Generate a secret hash and commit it as a vote
      const secretHash = utils.getSecretHash(VOTE, SALT);
      await utils.as(arbiter, dv.commitVote, ds.address, claimNumber, secretHash);

      // Increase time to get to the reveal phase
      await utils.increaseTime(config.paramDefaults.commitStageLength + 1);

      // Capture the initial tally for the vote option we committed, before revealing. It should
      // be zero.
      const initialTally = (await dv.revealedVotesForOption.call(claimId, VOTE));
      assert.strictEqual(initialTally.toString(10), '0',
        'the initial vote tally was not as-expected');

      // Reveal the arbiter's vote
      await utils.as(arbiter, dv.revealVote, claimId, VOTE, SALT);

      // The final tally for the option we revealed for should be one.
      const finalTally = (await dv.revealedVotesForOption.call(claimId, VOTE));
      assert.strictEqual(finalTally.toString(10), '1',
        'the final vote tally was not as-expected');
    });

    it('should not allow an arbiter to reveal twice', async () => {
      const dv = await DelphiVoting.deployed();

      // Set constants
      const CLAIM_NUMBER = '0'; // Use previous claim number
      const VOTE = '1'; // Use the same vote option we used before
      const SALT = '420';

      // Generate a claim ID
      const claimId = utils.getClaimId(DelphiStake.address, CLAIM_NUMBER);

      // Get the initial tally for the vote option we are going to try re-revealing in
      const initialTally = (await dv.revealedVotesForOption.call(claimId, VOTE));
      try {
        // Attempt to reveal again
        await utils.as(arbiter, dv.revealVote, claimId, VOTE, SALT);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        // The final tally should not have changed.
        const finalTally = (await dv.revealedVotesForOption.call(claimId, VOTE));
        assert(finalTally.toString(10), initialTally.toString(10),
          'an arbiter was able to reveal twice');

        return;
      }

      assert(false, 'an arbiter was able to reveal twice');
    });

    it('should revert if the provided vote and salt don\'t match the commitHash');

    it('should not allow an arbiter to reveal before the reveal stage has begun');
    it('should not allow an arbiter to reveal after the reveal stage has ended');
  });
});
