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

const HttpProvider = require('ethjs-provider-http');
const EthRPC = require('ethjs-rpc');
const Web3 = require('web3');

const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:7545'));
const rpc = new EthRPC(new HttpProvider('http://localhost:7545'));

const solkeccak = Web3.utils.soliditySha3;

contract('DelphiVoting', (accounts) => {
  describe('Function: commitVote', () => {
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

      // Create a DelphiVoting with 100 second voting periods, fee decay value of five, 
      // and which uses the registry we just created as its arbiter set
      const delphiVotingReceipt = await delphiVotingFactory.makeDelphiVoting(registry.address,
        5, [solkeccak('parameterizerVotingPeriod'), solkeccak('commitStageLen'),
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

    it('should initialize a new claim and log the arbiter\'s vote', async () => {
      // Set constants
      const CLAIM_AMOUNT = '10000';
      const FEE_AMOUNT = '1000';
      const VOTE = '1';
      const SALT = '420';

      // Make a new claim in the DelphiStake and generate a claim ID
      const claimNumber =
        await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, 'i love cats',
          delphiStake);
      const claimId = utils.getClaimId(delphiStake.address, claimNumber.toString(10));

      // Nobody has voted yet for the new claim, so from the DelphiVoting contract's perpective,
      // this claim does not exist.
      const initialClaimExists = await delphiVoting.claimExists.call(claimId);
      assert.strictEqual(initialClaimExists, false,
        'The claim was instantiated before it should have been');

      // Generate a secret hash and, as the arbiter, commit it for the claim which was just
      // opened
      const secretHash = utils.getSecretHash(VOTE, SALT);
      await delphiVoting.commitVote(delphiStake.address, claimNumber, secretHash,
        { from: arbiterAlice });

      // Now, because an arbiter has voted, a claim should exist in the eyes of the DV contract
      const finalClaimExists = await delphiVoting.claimExists.call(claimId);
      assert.strictEqual(finalClaimExists, true, 'The claim was not instantiated');

      // Lets also make sure the secret hash which was stored was the same which we committed.
      const storedSecretHash =
        await delphiVoting.getArbiterCommitForClaim.call(claimId, arbiterAlice);
      assert.strictEqual(storedSecretHash, secretHash, 'The vote was not properly stored');
    });

    it('should update an arbiter\'s vote in a claim', async () => {
      // Set constants
      const CLAIM_AMOUNT = '10000';
      const FEE_AMOUNT = '1000';
      const SALT = '420';

      // Make a new claim in the DelphiStake and generate a claim ID
      const claimNumber =
        await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, 'i love cats',
          delphiStake);
      const claimId = utils.getClaimId(delphiStake.address, claimNumber.toString(10));

      // Generate an initial secret hash and, as the arbiter, commit it for the claim which
      // was just opened
      const initialSecretHash = utils.getSecretHash(1, SALT);
      await delphiVoting.commitVote(delphiStake.address, claimNumber, initialSecretHash,
        { from: arbiterAlice });

      // Generate a final secret hash and, as the arbiter, commit it for the claim which
      // was just opened
      const finalSecretHash = utils.getSecretHash(0, SALT);
      await delphiVoting.commitVote(delphiStake.address, claimNumber, finalSecretHash,
        { from: arbiterAlice });

      // Lets also make sure the secret hash which was stored was the same which we committed.
      const storedSecretHash =
        await delphiVoting.getArbiterCommitForClaim.call(claimId, arbiterAlice);
      assert.strictEqual(storedSecretHash, finalSecretHash, 'The vote was not properly stored');
    });

    it('should not allow a non-arbiter to vote', async () => {
      // Set constants
      const CLAIM_AMOUNT = '10000';
      const FEE_AMOUNT = '1000';
      const VOTE = '1';
      const SALT = '420';

      // Make a new claim in the DelphiStake and generate a claim ID
      const claimNumber =
        await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, 'i love cats',
          delphiStake);

      // Generate a secret hash and, as a non-arbiter, try to commit it for the claim which
      // was just opened
      const secretHash = utils.getSecretHash(VOTE, SALT);
      try {
        await delphiVoting.commitVote(delphiStake.address, claimNumber, secretHash,
          { from: staker });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        return;
      }

      assert(false, 'should not have been able to vote as non-arbiter');
    });

    it('should not allow an arbiter to commit after the commit period has ended', async () => {
      // Set constants
      const CLAIM_AMOUNT = '10000';
      const FEE_AMOUNT = '1000';
      const VOTE = '1';
      const SALT = '420';

      // Make a new claim in the DelphiStake and generate a claim ID
      const claimNumber =
        await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, 'i love cats',
          delphiStake);

      // Generate a secret hash and, as the arbiter, commit it for the claim which was just
      // opened. This instantiates the claim and gets the clock ticking.
      const secretHash = utils.getSecretHash(VOTE, SALT);
      await delphiVoting.commitVote(delphiStake.address, claimNumber, secretHash,
        { from: arbiterAlice });

      // Increase time past the commit period
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [101] });

      try {
        await delphiVoting.commitVote(delphiStake.address, claimNumber, secretHash,
          { from: arbiterAlice });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        try {
          await delphiVoting.commitVote(delphiStake.address, claimNumber, secretHash,
            { from: arbiterBob });
        } catch (err2) {
          assert(utils.isEVMRevert(err2), err2.toString());

          return;
        }
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
          await delphiVoting.commitVote(delphiStake.address, NON_EXISTANT_CLAIM, secretHash,
            { from: arbiterAlice });
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
        const CLAIM_AMOUNT = '10000';
        const FEE_AMOUNT = '1000';

        // Make a new claim in the DelphiStake and generate a claim ID
        const claimNumber =
          await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, 'i love cats',
            delphiStake);

        try {
          await delphiVoting.commitVote(delphiStake.address, claimNumber, 0,
            { from: arbiterAlice });
        } catch (err) {
          assert(utils.isEVMRevert(err), err.toString());

          return;
        }

        assert(false, 'expected to not allow an arbiter to commit a secret hash of 0');
      });
  });
});
