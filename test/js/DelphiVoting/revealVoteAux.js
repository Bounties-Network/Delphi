/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiVoting = artifacts.require('DelphiVoting');
const DelphiStake = artifacts.require('DelphiStake');

const utils = require('../utils.js');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./conf/registryConfig.json'));

contract('DelphiVoting', (accounts) => {
  describe('Function: revealVote - part 2', () => {
    const [staker, claimant, arbiter] = accounts;

    before(async () => {
      // Add an arbiter to the whitelist
      await utils.addToWhitelist(utils.getArbiterListingId(arbiter),
        config.paramDefaults.minDeposit, arbiter);
    });

    it('should revert if the provided vote and salt don\'t match the commitHash', async () => {
      const dv = await DelphiVoting.deployed();
      const ds = await DelphiStake.deployed();

      // Set constants
      const CLAIM_AMOUNT = '10';
      const FEE_AMOUNT = '10';
      const VOTE = '2';
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

      // Reveal the arbiter's vote
      try {
        await utils.as(arbiter, dv.revealVote, claimId, VOTE, '69');
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }

      assert(false, 'Expected to revert if the provided vote and salt don\'t match the commitHash');
    });
    it('should not allow an arbiter to reveal before the reveal stage has begun', async () => {
      const dv = await DelphiVoting.deployed();
      const ds = await DelphiStake.deployed();

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

      // Generate a secret hash and commit it as a vote
      const secretHash = utils.getSecretHash(VOTE, SALT);
      await utils.as(arbiter, dv.commitVote, ds.address, claimNumber, secretHash);

      try {
        await utils.as(arbiter, dv.revealVote, claimId, VOTE, SALT);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }

      assert(false, 'Expected to not allow an arbiter to reveal before the reveal stage has begun');
    });

    it('should not allow an arbiter to reveal after the reveal stage has ended', async () => {
      const dv = await DelphiVoting.deployed();
      const ds = await DelphiStake.deployed();

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

      // Generate a secret hash and commit it as a vote
      const secretHash = utils.getSecretHash(VOTE, SALT);
      await utils.as(arbiter, dv.commitVote, ds.address, claimNumber, secretHash);

      await utils.increaseTime(config.paramDefaults.pRevealStageLength + 1);

      try {
        await utils.as(arbiter, dv.revealVote, claimId, VOTE, SALT);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }

      assert(false, 'Expected to not allow an arbiter to reveal before the reveal stage has ended');
    });
    it('should set hasRevealed to true for the msg.sender', async () => {
      const dv = await DelphiVoting.deployed();
      const ds = await DelphiStake.deployed();

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

      // Generate a secret hash and commit it as a vote
      const secretHash = utils.getSecretHash(VOTE, SALT);
      await utils.as(arbiter, dv.commitVote, ds.address, claimNumber, secretHash);

      // Increase time to get to the reveal phase
      await utils.increaseTime(config.paramDefaults.commitStageLength + 1);

      // Reveal the arbiter's vote
      await utils.as(arbiter, dv.revealVote, claimId, VOTE, SALT);

      try {
        // Second require of revealVote function at contract
        // if it doesnt pass is because the flag is true
        await utils.as(arbiter, dv.revealVote, claimId, VOTE, SALT);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }
      assert(false, 'Expected to set hasRevealed to true for the msg.sender');
    });
  });
});
