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
  describe('Function: revealVote', () => {
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

    it('should reveal an arbiter\'s vote and update the vote tally for a vote of 0', async () => {
      // Set constants
      const CLAIM_AMOUNT = '10000';
      const FEE_AMOUNT = '1000';
      const VOTE = '0';
      const SALT = '420';
      const DATA = 'i love cats';

      // Open a new claim on the DS and generate a claim ID for it
      const claimNumber =
        await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, DATA, delphiStake);
      const claimId = utils.getClaimId(delphiStake.address, claimNumber.toString(10));

      // Generate a secret hash and commit it as a vote
      const secretHash = utils.getSecretHash(VOTE, SALT);
      await delphiVoting.commitVote(delphiStake.address, claimNumber, secretHash,
        { from: arbiterAlice });

      // Increase time to get to the reveal phase
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [101] });

      // Capture the initial tally for the vote option we committed, before revealing. It should
      // be zero.
      const initialTally = (await delphiVoting.revealedVotesForOption.call(claimId, VOTE));
      assert.strictEqual(initialTally.toString(10), '0',
        'the initial vote tally was not as-expected');

      // Reveal the arbiter's vote
      const insertPoint = await delphiVoting.getInsertPoint.call(claimId, arbiterAlice, VOTE);
      await delphiVoting.revealVote(claimId, VOTE, SALT, insertPoint, { from: arbiterAlice });

      // The final tally for the option we revealed for should be one.
      const finalTally = (await delphiVoting.revealedVotesForOption.call(claimId, VOTE));
      assert.strictEqual(finalTally.toString(10), '1',
        'the final vote tally was not as-expected');
    });

    it('should not allow an arbiter to reveal twice', async () => {
      // Set constants
      const CLAIM_AMOUNT = '10000';
      const FEE_AMOUNT = '1000';
      const VOTE = '0';
      const SALT = '420';
      const DATA = 'i love cats';

      // Open a new claim on the DS and generate a claim ID for it
      const claimNumber =
        await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, DATA, delphiStake);
      const claimId = utils.getClaimId(delphiStake.address, claimNumber.toString(10));

      // Generate a secret hash and commit it as a vote
      const secretHash = utils.getSecretHash(VOTE, SALT);
      await delphiVoting.commitVote(delphiStake.address, claimNumber, secretHash,
        { from: arbiterAlice });

      // Increase time to get to the reveal phase
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [101] });

      // Reveal the arbiter's vote
      const insertPoint = await delphiVoting.getInsertPoint.call(claimId, arbiterAlice, VOTE);
      await delphiVoting.revealVote(claimId, VOTE, SALT, insertPoint, { from: arbiterAlice });

      try {
        await delphiVoting.revealVote(claimId, VOTE, SALT, insertPoint, { from: arbiterAlice });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        return;
      }

      assert(false, 'an arbiter was able to reveal twice');
    });

    it('Should revert if the provided vote and salt don\'t match the commitHash', async () => {
      // Set constants
      const CLAIM_AMOUNT = '10000';
      const FEE_AMOUNT = '1000';
      const VOTE = '0';
      const SALT = '420';
      const DATA = 'i love cats';

      // Open a new claim on the DS and generate a claim ID for it
      const claimNumber =
        await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, DATA, delphiStake);
      const claimId = utils.getClaimId(delphiStake.address, claimNumber.toString(10));

      // Generate a secret hash and commit it as a vote
      const secretHash = utils.getSecretHash(VOTE, SALT);
      await delphiVoting.commitVote(delphiStake.address, claimNumber, secretHash,
        { from: arbiterAlice });

      // Increase time to get to the reveal phase
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [101] });

      try {
        const insertPoint = await delphiVoting.getInsertPoint.call(claimId, arbiterAlice, VOTE);
        await delphiVoting.revealVote(claimId, VOTE, 421, insertPoint, { from: arbiterAlice });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        return;
      }

      assert(false, 'Expected to revert if the provided vote and salt don\'t match the commitHash');
    });

    it('Should not allow an arbiter to reveal before the reveal stage has begun', async () => {
      // Set constants
      const CLAIM_AMOUNT = '10000';
      const FEE_AMOUNT = '1000';
      const VOTE = '0';
      const SALT = '420';
      const DATA = 'i love cats';

      // Open a new claim on the DS and generate a claim ID for it
      const claimNumber =
        await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, DATA, delphiStake);
      const claimId = utils.getClaimId(delphiStake.address, claimNumber.toString(10));

      // Generate a secret hash and commit it as a vote
      const secretHash = utils.getSecretHash(VOTE, SALT);
      await delphiVoting.commitVote(delphiStake.address, claimNumber, secretHash,
        { from: arbiterAlice });

      try {
        const insertPoint = await delphiVoting.getInsertPoint.call(claimId, arbiterAlice, VOTE);
        await delphiVoting.revealVote(claimId, VOTE, SALT, insertPoint, { from: arbiterAlice });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        return;
      }

      assert(false, 'Expected to not allow an arbiter to reveal before the reveal stage has begun');
    });

    it('Should not allow an arbiter to reveal after the reveal stage has ended', async () => {
      // Set constants
      const CLAIM_AMOUNT = '10000';
      const FEE_AMOUNT = '1000';
      const VOTE = '0';
      const SALT = '420';
      const DATA = 'i love cats';

      // Open a new claim on the DS and generate a claim ID for it
      const claimNumber =
        await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, DATA, delphiStake);
      const claimId = utils.getClaimId(delphiStake.address, claimNumber.toString(10));

      // Generate a secret hash and commit it as a vote
      const secretHash = utils.getSecretHash(VOTE, SALT);
      await delphiVoting.commitVote(delphiStake.address, claimNumber, secretHash,
        { from: arbiterAlice });

      // Increase time to past the reveal stage
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [201] });

      try {
        const insertPoint = await delphiVoting.getInsertPoint.call(claimId, arbiterAlice, VOTE);
        await delphiVoting.revealVote(claimId, VOTE, SALT, insertPoint, { from: arbiterAlice });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        return;
      }
      assert(false, 'Expected to not allow an arbiter to reveal after the reveal stage has ended');
    });
  });
});
