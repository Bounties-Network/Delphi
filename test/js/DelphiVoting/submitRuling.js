/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiVoting = artifacts.require('DelphiVoting');
const DelphiStake = artifacts.require('DelphiStake');

const utils = require('../utils.js');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./conf/registryConfig.json'));


contract('DelphiVoting', (accounts) => { //eslint-disable-line
  describe('Function: submitRuling', () => {
    const [staker, claimant, arbiter, thirdPary] = accounts;
    before(async () => {
      // Add an arbiter to the whitelist
      await utils.addToWhitelist(utils.getArbiterListingId(arbiter),
        config.paramDefaults.minDeposit, arbiter);
    });
    it('should allow anyone to submit a ruling (non-voters)', async () => {
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
      assert.strictEqual(await dv.revealPeriodActive(claimId), false, 'The reveal period is active');
      assert.strictEqual(await dv.commitPeriodActive(claimId), false, 'The commit period is active');

      // Submit rulling as non-voter
      await utils.as(thirdPary, dv.submitRuling, ds.address, claimNumber);
    });
    it('should revert if the claimId generated from the stake address and claim number doesnt exist', async () => {
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
      assert.strictEqual(await dv.revealPeriodActive(claimId), false, 'The reveal period is active');
      assert.strictEqual(await dv.commitPeriodActive(claimId), false, 'The commit period is active');

      try {
        // Submit rulling with a wrong claim number
        await utils.as(thirdPary, dv.submitRuling, ds.address, '2');
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }
      assert(false, 'Expetected to revert if the claimId generated from the stake address and claim number doesnt exist');
    });
    it('should revert if the commit period is active', async () => {
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

      // Check if the claimId exists
      const initialClaimExists = await dv.claimExists.call(claimId);
      assert.strictEqual(initialClaimExists, false,
        'The claim was instantiated before it should have been');
      // 
      // Generate a secret hash and commit it as a vote
      const secretHash = utils.getSecretHash(VOTE, SALT);
      await utils.as(arbiter, dv.commitVote, ds.address, claimNumber, secretHash);
      await utils.increaseTime(config.paramDefaults.RevealStageLength + 1);
      // Check if submitRuling is available
      assert.strictEqual(await dv.revealPeriodActive(claimId), false, 'The reveal period is active');
      assert.strictEqual(await dv.commitPeriodActive(claimId), true, 'The commit period is inactive');

      try {
        // Submit rulling
        await utils.as(thirdPary, dv.submitRuling, ds.address, claimNumber);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }
      assert(false, 'Expetected to revert if the claimId generated from the stake address and claim number doesnt exist');
    });
    it('should revert if the reveal period is active', async () => {
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

      // Check if the claimId exists
      const initialClaimExists = await dv.claimExists.call(claimId);
      assert.strictEqual(initialClaimExists, false,
        'The claim was instantiated before it should have been');
      // 
      // Generate a secret hash and commit it as a vote
      const secretHash = utils.getSecretHash(VOTE, SALT);
      await utils.as(arbiter, dv.commitVote, ds.address, claimNumber, secretHash);
      await utils.increaseTime(1150);
      // console.log(await dv.revealPeriodActive(claimId));
      // console.log(await dv.commitPeriodActive(claimId));

      try {
        // Submit rulling
        await utils.as(thirdPary, dv.submitRuling, ds.address, claimNumber);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }
      assert(false, 'Expetected to revert if the reveal period is active');
    });
    it('should correctly tally the votes', async () => {
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
      assert.strictEqual(await dv.revealPeriodActive(claimId), false, 'The reveal period is active');
      assert.strictEqual(await dv.commitPeriodActive(claimId), false, 'The commit period is active');

      // Submit rulling as non-voter
      await utils.as(thirdPary, dv.submitRuling, ds.address, claimNumber);
      // Check if it is Fault 
      assert.strictEqual((await dv.claims(claimId))[2].toString(), '3', 'tally vote is not correct');
    });
    it('should correctly rule on the claim in the stake', async () => {
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
      assert.strictEqual(await dv.revealPeriodActive(claimId), false, 'The reveal period is active');
      assert.strictEqual(await dv.commitPeriodActive(claimId), false, 'The commit period is active');

      assert.strictEqual((await ds.claimableStake()).toString(), '20', '');
      await utils.as(arbiter, dv.submitRuling, ds.address, claimNumber);
      assert.strictEqual((await ds.claimableStake()).toString(), '40', 'Ruling did not work');
    });
  });
});
