/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiVoting = artifacts.require('DelphiVoting');
const DelphiStake = artifacts.require('DelphiStake');

const utils = require('../utils.js');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./conf/registryConfig.json'));

contract('DelphiVoting', (accounts) => {
  describe('Function: commitVote', () => {
    const [staker, arbiter, claimant, bob] = accounts;

    before(async () => {
      await utils.addToWhitelist(utils.getArbiterListingId(arbiter),
        config.paramDefaults.minDeposit, arbiter);
    });

    it('should initialize a new claim and log the arbiter\'s vote', async () => {
      const dv = await DelphiVoting.deployed();
      const ds = await DelphiStake.deployed();

      const claimAmount = '10';
      const feeAmount = '5';

      // Make a new claim
      const claimNumber = // should be zero
        await utils.makeNewClaim(staker, claimant, claimAmount, feeAmount, 'i love cats');
      const claimId = utils.getClaimId(DelphiStake.address, claimNumber.toString(10));

      const initialClaimExists = await dv.claimExists.call(claimId);
      assert.strictEqual(initialClaimExists, false,
        'The claim was instantiated before it should have been');

      const secretHash = utils.getSecretHash('1', '420');
      await utils.as(arbiter, dv.commitVote, ds.address, claimNumber, secretHash);

      const finalClaimExists = await dv.claimExists.call(claimId);
      assert.strictEqual(finalClaimExists, true, 'The claim was not instantiated');

      const storedSecretHash = await dv.getArbiterCommitForClaim.call(claimId, arbiter);
      assert.strictEqual(storedSecretHash, secretHash, 'The vote was not properly stored');
    });

    it('should update an arbiter\'s vote in a claim', async () => {
      const dv = await DelphiVoting.deployed();
      const ds = await DelphiStake.deployed();

      const claimNumber = '0'; // Use previous claim number
      const secretHash = utils.getSecretHash('2', '420');
      const claimId = utils.getClaimId(DelphiStake.address, claimNumber);

      const initialSecretHash = await dv.getArbiterCommitForClaim.call(claimId, arbiter);
      assert.notEqual(initialSecretHash, secretHash);

      await utils.as(arbiter, dv.commitVote, ds.address, claimNumber, secretHash);

      const finalSecretHash = await dv.getArbiterCommitForClaim.call(claimId, arbiter);
      assert.strictEqual(finalSecretHash, secretHash);
    });

    it('should not allow a non-arbiter to vote', async () => {
      const dv = await DelphiVoting.deployed();
      const ds = await DelphiStake.deployed();

      const claimNumber = '0'; // Use previous claim number
      const secretHash = utils.getSecretHash('1', '420');

      try {
        await utils.as(bob, dv.commitVote, ds.address, claimNumber, secretHash);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }
      assert(false, 'should not have been able to vote as non-arbiter');
    });

    it('should not allow an arbiter to commit after the commit period has ended');

    it('should not allow an arbiter to commit a vote for a claim which does not exist',
      async () => {
        const NON_EXISTANT_CLAIM = '420';
        const SALT = '420';
        const VOTE_CHOICE = '0';

        const dv = await DelphiVoting.deployed();
        const ds = await DelphiStake.deployed();

        // Generate a claimID
        const secretHash = utils.getSecretHash(VOTE_CHOICE, SALT);

        try {
          await utils.as(arbiter, dv.commitVote, ds.address, NON_EXISTANT_CLAIM, secretHash);
        } catch (err) {
          assert(utils.isEVMRevert(err), err.toString());
          return;
        }
        assert(false, 'should not have been able to vote in an uninitialized claim');
      },
    );
  });
});

