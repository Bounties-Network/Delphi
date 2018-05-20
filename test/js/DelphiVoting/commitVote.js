/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiVoting = artifacts.require('DelphiVoting');
const DelphiStake = artifacts.require('DelphiStake');
const DelphiStakeFactory = artifacts.require('DelphiStakeFactory');

const utils = require('../utils.js');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./conf/tcrConfig.json'));

contract('DelphiVoting', (accounts) => {
  describe('Function: commitVote', () => {
    const [staker, arbiter, arbiter2, claimant, bob] = accounts;

    let dv;
    let ds;

    before(async () => {
      const df = await DelphiStakeFactory.deployed();

      ds = await DelphiStake.at( await df.stakes.call('0') );
      dv = await DelphiVoting.deployed();

      // Add an arbiter to the whitelist
      await utils.addToWhitelist(utils.getArbiterListingId(arbiter),
        config.paramDefaults.minDeposit, arbiter);
    });

    it('should initialize a new claim and log the arbiter\'s vote', async () => {
      // Set constants
      const CLAIM_AMOUNT = '10';
      const FEE_AMOUNT = '10';
      const VOTE = '1';
      const SALT = '420';

      // Make a new claim in the DelphiStake and generate a claim ID
      const claimNumber = // should be zero, since this is the first test
        await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, 'i love cats');
      const claimId = utils.getClaimId(ds.address, claimNumber.toString(10));

      // Nobody has voted yet for the new claim, so from the DelphiVoting contract's perpective,
      // this claim does not exist.
      const initialClaimExists = await dv.claimExists.call(claimId);
      assert.strictEqual(initialClaimExists, false,
        'The claim was instantiated before it should have been');

      // Generate a secret hash and, as the arbiter, commit it for the claim which was just opened
      const secretHash = utils.getSecretHash(VOTE, SALT);
      await utils.as(arbiter, dv.commitVote, ds.address, claimNumber, secretHash);

      // Now, because an arbiter has voted, a claim should exist in the eyes of the DV contract
      const finalClaimExists = await dv.claimExists.call(claimId);
      assert.strictEqual(finalClaimExists, true, 'The claim was not instantiated');

      // Lets also make sure the secret hash which was stored was the same which we committed.
      const storedSecretHash = await dv.getArbiterCommitForClaim.call(claimId, arbiter);
      assert.strictEqual(storedSecretHash, secretHash, 'The vote was not properly stored');
    });

    it('should update an arbiter\'s vote in a claim', async () => {
      // Set constants
      const CLAIM_NUMBER = '0'; // Use previous claim number
      const VOTE = '2'; // Previous commit by this arbiter in this claim was for 2
      const SALT = '420';

      // Generate a new secretHash and compute the claim ID
      const secretHash = utils.getSecretHash(VOTE, SALT);
      const claimId = utils.getClaimId(ds.address, CLAIM_NUMBER);

      // Capture the initial secret hash and make sure it is not the same as our new secret hash
      const initialSecretHash = await dv.getArbiterCommitForClaim.call(claimId, arbiter);
      assert.notEqual(initialSecretHash, secretHash);

      // As the arbiter, commit the new secret hash
      await utils.as(arbiter, dv.commitVote, ds.address, CLAIM_NUMBER, secretHash);

      // The final secret hash should be different than the initial secret hash
      const finalSecretHash = await dv.getArbiterCommitForClaim.call(claimId, arbiter);
      assert.strictEqual(finalSecretHash, secretHash);
    });

    it('should not allow a non-arbiter to vote', async () => {
      // Set constants
      const CLAIM_NUMBER = '0'; // Use previous claim number
      const VOTE = '1';
      const SALT = '420';

      // Generate a secret hash
      const secretHash = utils.getSecretHash(VOTE, SALT);

      try {
        // As bob, who is not an arbiter, attempt to commit a vote
        await utils.as(bob, dv.commitVote, ds.address, CLAIM_NUMBER, secretHash);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }
      assert(false, 'should not have been able to vote as non-arbiter');
    });

    it('should not allow an arbiter to commit after the commit period has ended', async () => {
      await utils.addToWhitelist(utils.getArbiterListingId(arbiter2),
        config.paramDefaults.minDeposit, arbiter2);

      // Set constants
      const CLAIM_AMOUNT = '10';
      const FEE_AMOUNT = '10';
      const VOTE = '0';
      const SALT = '420';
      const DATA = 'i love cats';

      // Open a new claim on the DS and generate a claim ID for it
      const claimNumber = // should be zero
        await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, DATA);
      const claimId = utils.getClaimId(ds.address, claimNumber.toString(10));

      // Check if the claimId exists
      const initialClaimExists = await dv.claimExists.call(claimId);
      assert.strictEqual(initialClaimExists, false,
        'The claim was instantiated before it should have been');
      //
      // Generate a secret hash and commit it as a vote
      const secretHash = utils.getSecretHash(VOTE, SALT);
      await utils.as(arbiter, dv.commitVote, ds.address, claimNumber, secretHash);
      await utils.increaseTime(config.paramDefaults.pRevealStageLength + 1);

      // Check if submitRuling is available
      assert.strictEqual(await dv.commitPeriodActive(claimId), false, 'The commit period is active');

      try {
        await utils.as(arbiter, dv.commitVote, ds.address, claimNumber, secretHash);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }
      assert(false, 'Expetected to not allow an arbiter to commit after the commit period has ended');
    });

    it('should not allow an arbiter to commit a vote for a claim which does not exist',
      async () => {
        // Set constants
        const NON_EXISTANT_CLAIM = '420';
        const SALT = '420';
        const VOTE_CHOICE = '1';

        // Generate a secret hash
        const secretHash = utils.getSecretHash(VOTE_CHOICE, SALT);

        try {
          // As the arbiter, try to commit a vote for a claim which does not exist in the DS
          await utils.as(arbiter, dv.commitVote, ds.address, NON_EXISTANT_CLAIM, secretHash);
        } catch (err) {
          assert(utils.isEVMRevert(err), err.toString());
          return;
        }
        assert(false, 'should not have been able to vote in an uninitialized claim');
      },
    );

    it('should not allow an arbiter to commit a secret hash of 0',
      async () => {
        // Set constants
        const NON_EXISTANT_CLAIM = '420';

        // Secret hash 0x0
        const secretHash = '0x0';

        try {
          await utils.as(arbiter, dv.commitVote, ds.address, NON_EXISTANT_CLAIM, secretHash);
        } catch (err) {
          assert(utils.isEVMRevert(err), err.toString());
          return;
        }
        assert(false, 'expected to not allow an arbiter to commit a secret hash of 0');
      });
  });
});
