/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiVoting = artifacts.require('DelphiVoting');
const DelphiStake = artifacts.require('DelphiStake');
const DelphiStakeFactory = artifacts.require('DelphiStakeFactory');
const DelphiVotingFactory = artifacts.require('DelphiVotingFactory');
const RegistryFactory = artifacts.require('tcr/RegistryFactory.sol');
const Registry = artifacts.require('tcr/Registry.sol');
const EIP20 = artifacts.require('tokens/eip20/EIP20.sol');

const utils = require('../utils.js');
const BN = require('bignumber.js');

const HttpProvider = require('ethjs-provider-http');
const EthRPC = require('ethjs-rpc');
const Web3 = require('web3');

const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:7545'));
const rpc = new EthRPC(new HttpProvider('http://localhost:7545'));

const solkeccak = Web3.utils.soliditySha3;

contract('DelphiVoting', (accounts) => {
  describe('Function: claimFee', () => {
    const [staker, claimant, arbiterAlice, arbiterBob, arbiterCharlie] = accounts;

    let delphiStake;
    let delphiVoting;
    let token;

    beforeEach(async () => {
      // Get deployed factory contracts
      const delphiVotingFactory = await DelphiVotingFactory.deployed();
      const delphiStakeFactory = await DelphiStakeFactory.deployed();
      const registryFactory = await RegistryFactory.deployed();

      // Create a new registry and curation token
      const registryReceipt = await registryFactory.newRegistryWithToken(
        1000000,
        'RegistryCoin',
        0,
        'REG',
        [100, 100, 100, 100, 100, 100, 100, 100, 60, 60, 50, 50],
        'The Arbiter Registry',
      );

      // Get instances of the registry and its token
      const registryToken = EIP20.at(registryReceipt.logs[0].args.token);
      const registry = Registry.at(registryReceipt.logs[0].args.registry);

      // Give 100k REG to each account, and approve the Registry to transfer it
      await Promise.all(accounts.map(async (account) => {
        await registryToken.transfer(account, 100000);
        await registryToken.approve(registry.address, 100, { from: account });
      }));

      // Apply Alice, Bob, and Charlie to the registry
      await registry.apply(solkeccak(arbiterAlice), 100, '', { from: arbiterAlice });
      await registry.apply(solkeccak(arbiterBob), 100, '', { from: arbiterBob });
      await registry.apply(solkeccak(arbiterCharlie), 100, '', { from: arbiterCharlie });

      // Increase time past the registry application period
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [101] });

      // Add arbiters to the Registry
      await registry.updateStatus(solkeccak(arbiterAlice));
      await registry.updateStatus(solkeccak(arbiterBob));
      await registry.updateStatus(solkeccak(arbiterCharlie));

      // Create a DelphiVoting with 100 second voting periods, and which uses the registry we
      // just created as its arbiter set
      const delphiVotingReceipt = await delphiVotingFactory.makeDelphiVoting(registry.address,
        [solkeccak('parameterizerVotingPeriod'), solkeccak('commitStageLen'),
          solkeccak('revealStageLen')],
        [100, 100, 100]);
      delphiVoting = DelphiVoting.at(delphiVotingReceipt.logs[0].args.delphiVoting);

      // Create DisputeCoin and give 100k DIS to each account
      token = await EIP20.new(1000000, 'DisputeCoin', 0, 'DIS');
      await Promise.all(accounts.map(async account => token.transfer(account, 100000)));

      // Create a DelphiStake with 90k DIS tokens, 1k minFee, and a release time 1k seconds
      // from now
      await token.approve(delphiStakeFactory.address, 90000, { from: staker });
      const expirationTime = (await web3.eth.getBlock('latest')).timestamp + 1000;
      const delphiStakeReceipt = await delphiStakeFactory.createDelphiStake(90000, token.address,
        1000, '', expirationTime, delphiVoting.address, { from: staker });
      // eslint-disable-next-line
      delphiStake = DelphiStake.at(delphiStakeReceipt.logs[0].args._contractAddress);
    });

    it('should allow an arbiter to claim a fee', async () => {
      // Set constants
      const CLAIM_AMOUNT = '10000';
      const FEE_AMOUNT = '1000';
      const VOTE = '1';
      const SALT = '420';

      // Make a new claim and get its claimId
      const claimNumber =
        await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, 'i love cats',
          delphiStake);
      const claimId = utils.getClaimId(delphiStake.address, claimNumber.toString(10));

      // Get the secret hash for the salted vote
      const secretHash = utils.getSecretHash(VOTE, SALT);

      // Commit vote
      await delphiVoting.commitVote(delphiStake.address, claimNumber, secretHash,
        { from: arbiterAlice });

      // Increase time to get to the reveal phase
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [101] });

      // Reveal vote
      await delphiVoting.revealVote(claimId, VOTE, SALT, { from: arbiterAlice });

      // Increase time to finish the reveal phase so we can submit
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [100] });

      // Submit ruling
      await delphiVoting.submitRuling(delphiStake.address, claimNumber, { from: arbiterAlice });

      // Claim fee. Capture the arbiters balance before and after.
      const startingBalance = await token.balanceOf(arbiterAlice);
      await delphiVoting.claimFee(delphiStake.address, claimNumber, VOTE, SALT,
        { from: arbiterAlice });
      const finalBalance = await token.balanceOf(arbiterAlice);

      // The arbiter's final balance should be their starting balance plus the entire FEE_AMOUNT,
      // since they were the only voter and should get the whole amount
      assert.strictEqual(finalBalance.toString(10),
        startingBalance.add(new BN(FEE_AMOUNT, 10)).toString(10));
    });

    it('should not allow an arbiter to claim a fee twice', async () => {
      // Set constants
      const CLAIM_AMOUNT = '10000';
      const FEE_AMOUNT = '1000';
      const VOTE = '1';
      const SALT = '420';

      // Make a new claim and get its claimId
      const claimNumber =
        await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, 'i love cats',
          delphiStake);
      const claimId = utils.getClaimId(delphiStake.address, claimNumber.toString(10));

      // Get the secret hash for the salted vote
      const secretHash = utils.getSecretHash(VOTE, SALT);

      // Commit vote
      await delphiVoting.commitVote(delphiStake.address, claimNumber, secretHash,
        { from: arbiterAlice });

      // Increase time to get to the reveal phase
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [101] });

      // Reveal vote
      await delphiVoting.revealVote(claimId, VOTE, SALT, { from: arbiterAlice });

      // Increase time to finish the reveal phase so we can submit
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [100] });

      // Submit ruling
      await delphiVoting.submitRuling(delphiStake.address, claimNumber, { from: arbiterAlice });

      // Claim fee. Capture the arbiters balance before and after.
      await delphiVoting.claimFee(delphiStake.address, claimNumber, VOTE, SALT,
        { from: arbiterAlice });

      // Add tokens to the delphiVoting contract so it doesn't fail on an insufficient balance
      // when we try to claim again
      await token.transfer(delphiVoting.address, FEE_AMOUNT);

      try {
        await delphiVoting.claimFee(delphiStake.address, claimNumber, VOTE, SALT,
          { from: arbiterAlice });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        return;
      }

      assert(false, 'an arbiter was able to claim a fee twice');
    });

    it('should not allow an arbiter to claim a fee when they voted out of the plurality',
      async () => {
        // Set constants
        const CLAIM_AMOUNT = '10000';
        const FEE_AMOUNT = '1000';
        const PLURALITY_VOTE = '1';
        const NON_PLURALITY_VOTE = '0';
        const SALT = '420';

        // Compute secret hashes for the plurality and non-plurality vote options
        const pluralitySecretHash = utils.getSecretHash(PLURALITY_VOTE, SALT);
        const nonPluralitySecretHash = utils.getSecretHash(NON_PLURALITY_VOTE, SALT);

        // Make a new claim and compute its claim ID.
        const claimNumber =
          await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, 'i love cats',
            delphiStake);
        const claimId = utils.getClaimId(delphiStake.address, claimNumber.toString(10));

        // Arbiters commit votes. Charlie commits the non-plurality vote.
        await delphiVoting.commitVote(delphiStake.address, claimNumber, pluralitySecretHash,
          { from: arbiterAlice });
        await delphiVoting.commitVote(delphiStake.address, claimNumber, pluralitySecretHash,
          { from: arbiterBob });
        await delphiVoting.commitVote(delphiStake.address, claimNumber, nonPluralitySecretHash,
          { from: arbiterCharlie });

        // Increase time to get to the reveal phase
        await rpc.sendAsync({ method: 'evm_increaseTime', params: [101] });

        // Arbiters reveal votes
        await delphiVoting.revealVote(claimId, PLURALITY_VOTE, SALT, { from: arbiterAlice });
        await delphiVoting.revealVote(claimId, PLURALITY_VOTE, SALT, { from: arbiterBob });
        await delphiVoting.revealVote(claimId, NON_PLURALITY_VOTE, SALT, { from: arbiterCharlie });

        // Increase time to finish the reveal phase so we can submit the ruling
        await rpc.sendAsync({ method: 'evm_increaseTime', params: [100] });

        // Submit ruling
        await delphiVoting.submitRuling(delphiStake.address, claimNumber, { from: arbiterAlice });

        // Capture Charlie's starting balance
        const startingBalance = await token.balanceOf(arbiterCharlie);
        try {
          // non-plurality arbiter, Charlie, attempts claim fee
          await delphiVoting.claimFee(delphiStake.address, claimNumber, NON_PLURALITY_VOTE,
            SALT, { from: arbiterCharlie });
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
      // Set constants
      const CLAIM_AMOUNT = '10000';
      const FEE_AMOUNT = new BN('1000', 10);
      const PLURALITY_VOTE = '1';
      const SALT = '420';

      // Compute secret hashes for the plurality and non-plurality vote options
      const pluralitySecretHash = utils.getSecretHash(PLURALITY_VOTE, SALT);

      // Make a new claim and compute its claim ID.
      const claimNumber =
        await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, 'i love cats',
          delphiStake);
      const claimId = utils.getClaimId(delphiStake.address, claimNumber.toString(10));

      // Arbiters commit votes.
      await delphiVoting.commitVote(delphiStake.address, claimNumber, pluralitySecretHash,
        { from: arbiterAlice });
      await delphiVoting.commitVote(delphiStake.address, claimNumber, pluralitySecretHash,
        { from: arbiterBob });

      // Increase time to get to the reveal phase
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [101] });

      // Arbiters reveal votes
      await delphiVoting.revealVote(claimId, PLURALITY_VOTE, SALT, { from: arbiterAlice });
      await delphiVoting.revealVote(claimId, PLURALITY_VOTE, SALT, { from: arbiterBob });

      // Increase time to finish the reveal phase so we can submit the ruling
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [100] });

      // Submit ruling
      await delphiVoting.submitRuling(delphiStake.address, claimNumber, { from: arbiterAlice });

      // Capture Alice's starting token balance, claim the fee and get her final balance
      const startingBalanceAlice = await token.balanceOf(arbiterAlice);
      await delphiVoting.claimFee(delphiStake.address, claimNumber, PLURALITY_VOTE, SALT,
        { from: arbiterAlice });
      const finalBalanceAlice = await token.balanceOf(arbiterAlice);

      // Alice's expected final balance is her starting balance plus half the total available fee
      const expectedFinalBalanceAlice = startingBalanceAlice.plus(FEE_AMOUNT
        .div(new BN(2, 10)))
        .round(0, BN.ROUND_DOWN);
      assert.strictEqual(finalBalanceAlice.toString(10), expectedFinalBalanceAlice.toString(10),
        'Alice did not get the proper fee allocation');

      // Capture Bob's starting token balance, claim the fee and get his final balance
      const startingBalanceBob = await token.balanceOf(arbiterBob);
      await delphiVoting.claimFee(delphiStake.address, claimNumber, PLURALITY_VOTE, SALT,
        { from: arbiterBob });
      const finalBalanceBob = await token.balanceOf(arbiterBob);

      // Bob's expected final balance is his starting balance plus half the total available fee
      const expectedFinalBalanceBob = startingBalanceBob.plus(FEE_AMOUNT
        .div(new BN(2, 10)))
        .round(0, BN.ROUND_DOWN);
      assert.strictEqual(finalBalanceBob.toString(10), expectedFinalBalanceBob.toString(10),
        'Bob did not get the proper fee allocation');
    });

    it('should revert if called by anyone but one of the arbiters', async () => {
      // Set constants
      const CLAIM_AMOUNT = '10000';
      const FEE_AMOUNT = '1000';
      const VOTE = '1';
      const SALT = '420';

      // Make a new claim and get its claimId
      const claimNumber =
        await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, 'i love cats',
          delphiStake);
      const claimId = utils.getClaimId(delphiStake.address, claimNumber.toString(10));

      // Get the secret hash for the salted vote
      const secretHash = utils.getSecretHash(VOTE, SALT);

      // Commit vote
      await delphiVoting.commitVote(delphiStake.address, claimNumber, secretHash,
        { from: arbiterAlice });

      // Increase time to get to the reveal phase
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [101] });

      // Reveal vote
      await delphiVoting.revealVote(claimId, VOTE, SALT, { from: arbiterAlice });

      // Increase time to finish the reveal phase so we can submit
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [100] });

      // Submit ruling
      await delphiVoting.submitRuling(delphiStake.address, claimNumber, { from: arbiterAlice });

      try {
        await delphiVoting.claimFee(delphiStake.address, claimNumber, VOTE, SALT,
          { from: claimant });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        return;
      }

      assert(false, 'Expected to revert if called by anyone but one of the arbiters');
    });

    it('should not allow an arbiter to claim a fee when they did not commit', async () => {
      // Set constants
      const CLAIM_AMOUNT = '10000';
      const FEE_AMOUNT = '1000';
      const VOTE = '1';
      const SALT = '420';

      // Make a new claim and get its claimId
      const claimNumber =
        await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, 'i love cats',
          delphiStake);
      const claimId = utils.getClaimId(delphiStake.address, claimNumber.toString(10));

      // Get the secret hash for the salted vote
      const secretHash = utils.getSecretHash(VOTE, SALT);

      // Commit vote
      await delphiVoting.commitVote(delphiStake.address, claimNumber, secretHash,
        { from: arbiterAlice });

      // Increase time to get to the reveal phase
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [101] });

      // Reveal vote
      await delphiVoting.revealVote(claimId, VOTE, SALT, { from: arbiterAlice });

      // Increase time to finish the reveal phase so we can submit
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [100] });

      // Submit ruling
      await delphiVoting.submitRuling(delphiStake.address, claimNumber, { from: arbiterAlice });

      try {
        await delphiVoting.claimFee(delphiStake.address, claimNumber, VOTE, SALT,
          { from: arbiterBob });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        return;
      }

      assert(false, 'Expetected to not allow an arbiter to claim a fee when they did not commit');
    });

    it('should not allow an arbiter to claim a fee when they committed but did not reveal', async () => {
      // Set constants
      const CLAIM_AMOUNT = '10000';
      const FEE_AMOUNT = '1000';
      const VOTE = '1';
      const SALT = '420';

      // Make a new claim and get its claimId
      const claimNumber =
        await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, 'i love cats',
          delphiStake);

      // Get the secret hash for the salted vote
      const secretHash = utils.getSecretHash(VOTE, SALT);

      // Commit vote
      await delphiVoting.commitVote(delphiStake.address, claimNumber, secretHash,
        { from: arbiterAlice });

      // Increase time to get to the reveal phase
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [101] });

      // DO NOT reveal vote

      // Increase time to finish the reveal phase so we can submit
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [100] });

      // Submit ruling
      await delphiVoting.submitRuling(delphiStake.address, claimNumber, { from: arbiterAlice });

      try {
        await delphiVoting.claimFee(delphiStake.address, claimNumber, VOTE, SALT,
          { from: arbiterAlice });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        return;
      }

      assert(false, 'Expetected to not allow an arbiter to claim a fee when they committed but did not reveal');
    });
  });
});
