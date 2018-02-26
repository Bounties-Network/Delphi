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
      const dv = await DelphiVoting.deployed();
      const ds = await DelphiStake.deployed();
      await utils.initDelphiStake(staker, dv.address);
      const token = EIP20.at(await ds.token.call());

      // The claimant will need tokens to fund fees when they make claims
      await utils.as(staker, token.transfer, claimant, '1000');

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

      const claimAmount = '10';
      const feeAmount = '5';
      const vote = '1';
      const salt = '420';
      const secretHash = utils.getSecretHash(vote, salt);

      // Make a new claim
      const claimNumber = // should be zero
        await utils.makeNewClaim(staker, claimant, claimAmount, feeAmount, 'i love cats');
      const claimId = utils.getClaimId(DelphiStake.address, claimNumber.toNumber(10));

      // Commit vote
      await utils.as(arbiterAlice, dv.commitVote, claimId, secretHash);
      await utils.increaseTime(config.paramDefaults.commitStageLength + 1);

      // Reveal vote
      await utils.as(arbiterAlice, dv.revealVote, claimId, vote, salt);
      await utils.increaseTime(config.paramDefaults.revealStageLength);

      // Submit ruling
      await utils.as(arbiterAlice, dv.submitRuling, DelphiStake.address, claimNumber);

      // Claim fee
      const startingBalance = await token.balanceOf(arbiterAlice);
      await utils.as(arbiterAlice, dv.claimFee, DelphiStake.address, claimNumber, vote, salt);
      const finalBalance = await token.balanceOf(arbiterAlice);

      assert.strictEqual(finalBalance.toString(10),
        startingBalance.add(new BN(feeAmount, 10)).toString(10));
    });

    it('should not allow an arbiter to claim a fee twice', async () => {
      const dv = await DelphiVoting.deployed();
      const ds = await DelphiStake.deployed();
      const token = EIP20.at(await ds.token.call());

      const vote = '1';
      const salt = '420';
      const claimNumber = '0'; // Use previous claim

      const startingBalance = await token.balanceOf(arbiterAlice);
      try {
        // Claim (again)
        await utils.as(arbiterAlice, dv.claimFee, DelphiStake.address, claimNumber, vote, salt);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

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

        const claimAmount = '10';
        const feeAmount = '5';
        const pluralityVote = '1';
        const nonPluralityVote = '0';
        const salt = '420';
        const pluralitySecretHash = utils.getSecretHash(pluralityVote, salt);
        const nonPluralitySecretHash = utils.getSecretHash(nonPluralityVote, salt);

        // Make a new claim
        const claimNumber = // should be one
        await utils.makeNewClaim(staker, claimant, claimAmount, feeAmount, 'i love cats');
        const claimId = utils.getClaimId(DelphiStake.address, claimNumber.toNumber(10));

        // commit votes
        await utils.as(arbiterAlice, dv.commitVote, claimId, pluralitySecretHash);
        await utils.as(arbiterBob, dv.commitVote, claimId, pluralitySecretHash);
        await utils.as(arbiterCharlie, dv.commitVote, claimId, nonPluralitySecretHash);
        await utils.increaseTime(config.paramDefaults.commitStageLength + 1);

        // reveal votes
        await utils.as(arbiterAlice, dv.revealVote, claimId, pluralityVote, salt);
        await utils.as(arbiterBob, dv.revealVote, claimId, pluralityVote, salt);
        await utils.as(arbiterCharlie, dv.revealVote, claimId, nonPluralityVote, salt);
        await utils.increaseTime(config.paramDefaults.revealStageLength);

        // Submit ruling
        await utils.as(arbiterAlice, dv.submitRuling, DelphiStake.address, claimNumber);

        const startingBalance = await token.balanceOf(arbiterCharlie);
        try {
          // non-plurality arbiter attempts claim
          await utils.as(arbiterCharlie, dv.claimFee, DelphiStake.address, claimNumber,
            nonPluralityVote, salt);
        } catch (err) {
          assert(utils.isEVMRevert(err), err.toString());

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

      const claimNumber = '1'; // Use previous claim
      const feeAmount = new BN('5', 10); // Use previous fee amount
      const pluralityVote = '1'; // Use previous plurality vote
      const salt = '420'; // Use previous salt
      const pluralityArbiters = new BN('2', 10); // Alice and Bob voted in the plurality

      // Alice fee claim
      const startingBalanceAlice = await token.balanceOf(arbiterAlice);
      await utils.as(arbiterAlice, dv.claimFee, DelphiStake.address, claimNumber,
        pluralityVote, salt);
      const finalBalanceAlice = await token.balanceOf(arbiterAlice);
      const expectedFinalBalanceAlice = startingBalanceAlice.plus(feeAmount.div(pluralityArbiters))
        .round(0, BN.ROUND_DOWN);
      assert.strictEqual(finalBalanceAlice.toString(10), expectedFinalBalanceAlice.toString(10),
        'Alice did not get the proper fee allocation');

      // Bob fee claim
      const startingBalanceBob = await token.balanceOf(arbiterBob);
      await utils.as(arbiterBob, dv.claimFee, DelphiStake.address, claimNumber,
        pluralityVote, salt);
      const finalBalanceBob = await token.balanceOf(arbiterBob);
      const expectedFinalBalanceBob = startingBalanceBob.plus(feeAmount.div(pluralityArbiters))
        .round(0, BN.ROUND_DOWN);
      assert.strictEqual(finalBalanceBob.toString(10), expectedFinalBalanceBob.toString(10),
        'Bob did not get the proper fee allocation');
    });

    it('should not allow an arbiter to claim a fee when they did not commit');
    it('should not allow an arbiter to claim a fee when they committed but did not reveal');
  });
});
