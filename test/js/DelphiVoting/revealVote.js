/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiVoting = artifacts.require('DelphiVoting');
const DelphiStake = artifacts.require('DelphiStake');

const utils = require('../utils.js');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./conf/registryConfig.json'));

contract('DelphiVoting', (accounts) => {
  describe('Function: revealVote', () => {
    const [arbiter] = accounts;

    before(async () => {
      await utils.addToWhitelist(utils.getArbiterListingId(arbiter),
        config.paramDefaults.minDeposit, arbiter);
    });

    it('should reveal an arbiter\'s vote and update the vote tally', async () => {
      const dv = await DelphiVoting.deployed();
      const claimId = utils.getClaimId(DelphiStake.address, '1');
      const secretHash = utils.getSecretHash('1', '420');

      await utils.as(arbiter, dv.commitVote, claimId, secretHash);

      await utils.increaseTime(config.paramDefaults.commitStageLength + 1);

      const initialTally = (await dv.revealedVotesForOption.call(claimId, '1'));
      assert.strictEqual(initialTally.toString(10), '0',
        'the initial vote tally was not as-expected');

      await utils.as(arbiter, dv.revealVote, claimId, '1', '420');

      const finalTally = (await dv.revealedVotesForOption.call(claimId, '1'));
      assert.strictEqual(finalTally.toString(10), '1',
        'the final vote tally was not as-expected');
    });

    it('should not allow an arbiter to reveal twice', async () => {
      const dv = await DelphiVoting.deployed();
      const claimId = utils.getClaimId(DelphiStake.address, '1');

      const initialTally = (await dv.revealedVotesForOption.call(claimId, '1'));

      try {
        await utils.as(arbiter, dv.revealVote, claimId, '1', '420');
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        const finalTally = (await dv.revealedVotesForOption.call(claimId, '1'));
        assert(finalTally.eq(initialTally), 'an arbiter was able to reveal twice');

        return;
      }

      assert(false, 'an arbiter was able to reveal twice');
    });

    it('should revert if the provided vote and salt don\'t match the commitHash');

    it('should not allow an arbiter to reveal before the reveal stage has begun');
    it('should not allow an arbiter to reveal after the reveal stage has ended');
  });
});

