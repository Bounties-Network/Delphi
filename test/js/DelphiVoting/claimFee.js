/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiVoting = artifacts.require('DelphiVoting');
const DelphiStake = artifacts.require('DelphiStake');
const EIP20 = artifacts.require('tokens/eip20/EIP20.sol');

const utils = require('../utils.js');
const fs = require('fs');
const BN = require('bignumber.js');

const config = JSON.parse(fs.readFileSync('./conf/registryConfig.json'));

contract('DelphiVoting', (accounts) => {
  describe('Function: claimFee', () => {
    const [staker, claimant, arbiterAlice, arbiterBob, arbiterCharlie] = accounts;

    before(async () => {
      const ds = await DelphiStake.deployed();
      const token = EIP20.at(await ds.token.call());

      // The claimant will need tokens to fund fees when they make claims. The zero account
      // has lots of tokens because it deployed the token contract

      await utils.as(accounts[0], token.transfer, claimant, '1000');
      await utils.as(accounts[0], token.transfer, arbiterAlice, '1000');
      await utils.as(accounts[0], token.transfer, arbiterBob, '1000');
      await utils.as(accounts[0], token.transfer, arbiterCharlie, '1000');

      // Add arbiter actors to the TCR
      await utils.addToWhitelist(utils.getArbiterListingId(arbiterAlice),
        config.paramDefaults.minDeposit, arbiterAlice);
      await utils.addToWhitelist(utils.getArbiterListingId(arbiterBob),
        config.paramDefaults.minDeposit, arbiterBob);
      await utils.addToWhitelist(utils.getArbiterListingId(arbiterCharlie),
        config.paramDefaults.minDeposit, arbiterCharlie);
    });

    it('should allow an arbiter to claim a fee', async () => {
      const dv = await DelphiVoting.deployed();
      const ds = await DelphiStake.deployed();
      const token = EIP20.at(await ds.token.call());

      // Set constants
      const CLAIM_AMOUNT = '10';
      const FEE_AMOUNT = '10';
      const VOTE = '1';
      const SALT = '420';

      // Make a new claim and get its claimId
      const claimNumber = // should be zero, since this is the first test
        await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, 'i love cats');
      const claimId = utils.getClaimId(ds.address, claimNumber.toString(10));

      // Get the secret hash for the salted vote
      const secretHash = utils.getSecretHash(VOTE, SALT);

      // Commit vote
      await utils.as(arbiterAlice, dv.commitVote, ds.address, claimNumber, secretHash);

      // Increase time to get to the reveal phase
      await utils.increaseTime(config.paramDefaults.commitStageLength + 1);

      // Reveal vote
      await utils.as(arbiterAlice, dv.revealVote, claimId, VOTE, SALT);

      // Increase time to finish the reveal phase so we can submit
      await utils.increaseTime(config.paramDefaults.revealStageLength);

      // Submit ruling
      await utils.as(arbiterAlice, dv.submitRuling, DelphiStake.address, claimNumber);

      // Claim fee. Capture the arbiters balance before and after.
      const startingBalance = await token.balanceOf(arbiterAlice);
      await utils.as(arbiterAlice, dv.claimFee, DelphiStake.address, claimNumber, VOTE, SALT);
      const finalBalance = await token.balanceOf(arbiterAlice);

      // The arbiter's final balance should be their starting balance plus the entire FEE_AMOUNT,
      // since they were the only voter and should get the whole amount
      assert.strictEqual(finalBalance.toString(10),
        startingBalance.add(new BN(FEE_AMOUNT, 10)).toString(10));
    });

    it('should not allow an arbiter to claim a fee twice', async () => {
      const dv = await DelphiVoting.deployed();
      const ds = await DelphiStake.deployed();
      const token = EIP20.at(await ds.token.call());

      // Set constants
      const VOTE = '1';
      const SALT = '420';
      // We'll try to claim a fee for the same claim we successfully did in the previous test
      const CLAIM_NUMBER = '0';

      // Capture Alice's starting balance
      const startingBalance = await token.balanceOf(arbiterAlice);
      try {
        // Attempt to claim the fee again
        await utils.as(arbiterAlice, dv.claimFee, DelphiStake.address, CLAIM_NUMBER, VOTE, SALT);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        // The final balance and the starting balance should be the same
        const finalBalance = await token.balanceOf(arbiterAlice);
        assert.strictEqual(finalBalance.toString(10), startingBalance.toString(10),
          'An unnacountable state change occurred');

        return;
      }
      assert(false, 'The arbiter was able to claim a fee twice');
    });

    it('should not allow an arbiter to claim a fee when they voted out of the plurality',
      async () => {
        const dv = await DelphiVoting.deployed();
        const ds = await DelphiStake.deployed();
        const token = EIP20.at(await ds.token.call());

        // Set constants
        const CLAIM_AMOUNT = '10';
        const FEE_AMOUNT = '10';
        const PLURALITY_VOTE = '1';
        const NON_PLURALITY_VOTE = '0';
        const SALT = '420';

        // Compute secret hashes for the plurality and non-plurality vote options
        const pluralitySecretHash = utils.getSecretHash(PLURALITY_VOTE, SALT);
        const nonPluralitySecretHash = utils.getSecretHash(NON_PLURALITY_VOTE, SALT);

        // Make a new claim and compute its claim ID.
        const claimNumber = // should be one, since we have already made one claim (0)
        await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, 'i love cats');
        const claimId = utils.getClaimId(ds.address, claimNumber.toString(10));

        // Arbiters commit votes. Charlie commits the non-plurality vote.
        await utils.as(arbiterAlice, dv.commitVote, ds.address, claimNumber, pluralitySecretHash);
        await utils.as(arbiterBob, dv.commitVote, ds.address, claimNumber, pluralitySecretHash);
        await utils.as(arbiterCharlie, dv.commitVote, ds.address, claimNumber,
          nonPluralitySecretHash);

        // Increase time to get to the reveal phase
        await utils.increaseTime(config.paramDefaults.commitStageLength + 1);

        // Arbiters reveal votes
        await utils.as(arbiterAlice, dv.revealVote, claimId, PLURALITY_VOTE, SALT);
        await utils.as(arbiterBob, dv.revealVote, claimId, PLURALITY_VOTE, SALT);
        await utils.as(arbiterCharlie, dv.revealVote, claimId, NON_PLURALITY_VOTE, SALT);

        // Increase time to finish the reveal phase so we can submit the ruling
        await utils.increaseTime(config.paramDefaults.revealStageLength);

        // Submit ruling
        await utils.as(arbiterAlice, dv.submitRuling, DelphiStake.address, claimNumber);

        // Capture Charlie's starting balance
        const startingBalance = await token.balanceOf(arbiterCharlie);
        try {
          // non-plurality arbiter, Charlie, attempts claim fee
          await utils.as(arbiterCharlie, dv.claimFee, DelphiStake.address, claimNumber,
            NON_PLURALITY_VOTE, SALT);
        } catch (err) {
          assert(utils.isEVMRevert(err), err.toString());

          // Charlie's final balance should be equal to his starting balance
          const finalBalance = await token.balanceOf(arbiterCharlie);
          assert.strictEqual(finalBalance.toString(10), startingBalance.toString(10),
            'An unnacountable state change occurred');

          return;
        }

        assert(false, 'An arbiter who voted out of the plurality was able to claim fees');
      });

    it('should apportion the fee properly when multiple arbiters must claim', async () => {
      const dv = await DelphiVoting.deployed();
      const ds = await DelphiStake.deployed();
      const token = EIP20.at(await ds.token.call());

      // Use previous claim, since we have two arbiters who still have not claimed for it
      const CLAIM_NUMBER = '1';
      const FEE_AMOUNT = new BN('10', 10); // Use previous fee amount
      const PLURALITY_VOTE = '1'; // Use previous plurality vote
      const SALT = '420'; // Use previous salt
      const PLURALITY_ARBITERS_COUNT = new BN('2', 10); // Alice and Bob voted in the plurality

      // Capture Alice's starting token balance, claim the fee and get her final balance
      const startingBalanceAlice = await token.balanceOf(arbiterAlice);
      await utils.as(arbiterAlice, dv.claimFee, DelphiStake.address, CLAIM_NUMBER,
        PLURALITY_VOTE, SALT);
      const finalBalanceAlice = await token.balanceOf(arbiterAlice);

      // Alice's expected final balance is her starting balance plus half the total available fee
      const expectedFinalBalanceAlice = startingBalanceAlice.plus(FEE_AMOUNT
        .div(PLURALITY_ARBITERS_COUNT))
        .round(0, BN.ROUND_DOWN);
      assert.strictEqual(finalBalanceAlice.toString(10), expectedFinalBalanceAlice.toString(10),
        'Alice did not get the proper fee allocation');

      // Capture Bob's starting token balance, claim the fee and get his final balance
      const startingBalanceBob = await token.balanceOf(arbiterBob);
      await utils.as(arbiterBob, dv.claimFee, DelphiStake.address, CLAIM_NUMBER,
        PLURALITY_VOTE, SALT);
      const finalBalanceBob = await token.balanceOf(arbiterBob);

      // Bob's expected final balance is his starting balance plus half the total available fee
      const expectedFinalBalanceBob = startingBalanceBob.plus(FEE_AMOUNT
        .div(PLURALITY_ARBITERS_COUNT))
        .round(0, BN.ROUND_DOWN);
      assert.strictEqual(finalBalanceBob.toString(10), expectedFinalBalanceBob.toString(10),
        'Bob did not get the proper fee allocation');

      // NOTE that the fee amount is 5, but we *expect* Alice and Bob to each get two tokens.
      // Revisit this test after implementing safemath.
    });

    it('should revert if called by anyone but one of the arbiters');
    it('should not allow an arbiter to claim a fee when they did not commit');
    it('should not allow an arbiter to claim a fee when they committed but did not reveal');
  });
});
