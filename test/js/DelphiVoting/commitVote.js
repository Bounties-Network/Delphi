/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiVoting = artifacts.require('DelphiVoting');
const DelphiStake = artifacts.require('DelphiStake');

const utils = require('../utils.js');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./conf/registryConfig.json'));

contract('DelphiVoting', (accounts) => {
  describe('Function: commitVote', () => {
    const [arbiter, bob] = accounts;

    before(async () => {
      await utils.addToWhitelist(utils.getArbiterListingId(arbiter),
        config.paramDefaults.minDeposit, arbiter);
    });

    it('should initialize a new claim and log the arbiter\'s vote', async () => {
      const dv = await DelphiVoting.deployed();
      const claimId = utils.getClaimId(DelphiStake.address, '1');

      const initialClaimExists = await dv.claimExists.call(claimId);
      assert.strictEqual(initialClaimExists, false,
        'The claim was instantiated before it should have been');

      const secretHash = utils.getSecretHash('1', '420');
      await utils.as(arbiter, dv.commitVote, claimId, secretHash);

      const finalClaimExists = await dv.claimExists.call(claimId);
      assert.strictEqual(finalClaimExists, true, 'The claim was not instantiated');

      const storedSecretHash = await dv.getArbiterCommitForClaim.call(claimId, arbiter);
      assert.strictEqual(storedSecretHash, secretHash, 'The vote was not properly stored');
    });

    it('should update an arbiter\'s vote in a claim', async () => {
      const dv = await DelphiVoting.deployed();
      const claimId = utils.getClaimId(DelphiStake.address, '1');

      const secretHash = utils.getSecretHash('2', '420');

      const initialSecretHash = await dv.getArbiterCommitForClaim.call(claimId, arbiter);
      assert.notEqual(initialSecretHash, secretHash);

      await utils.as(arbiter, dv.commitVote, claimId, secretHash);

      const finalSecretHash = await dv.getArbiterCommitForClaim.call(claimId, arbiter);
      assert.strictEqual(finalSecretHash, secretHash);
    });

    it('should not allow a non-arbiter to vote', async () => {
      const dv = await DelphiVoting.deployed();
      const claimId = utils.getClaimId(DelphiStake.address, '1');

      const secretHash = utils.getSecretHash('1', '420');

      try {
        await utils.as(bob, dv.commitVote, claimId, secretHash);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }
      assert(false, 'should not have been able to vote as non-arbiter');
    });

    it('should not allow an arbiter to commit after the commit period has ended');
  });
});

