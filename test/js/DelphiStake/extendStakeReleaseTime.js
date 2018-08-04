/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiStake = artifacts.require('DelphiStake');
const EIP20 = artifacts.require('EIP20');

const utils = require('../utils.js');

const conf = utils.getConfig();

const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./conf/tcrConfig.json'));

contract('DelphiStake', (accounts) => {// eslint-disable-line
  describe('Function: extendStakeReleaseTime', () => {
    const [staker, claimant, arbiter] = accounts;

    let ds;

    beforeEach(async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });
      ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });

      await ds.initDelphiStake(staker, conf.initialStake, token.address, conf.data,
        conf.deadline, { from: staker });
    });

    it('should revert if called by anyone but the staker', async () => {
      try {
        await ds.extendStakeReleaseTime(config.paramDefaults.revealStageLength, { from: claimant });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        return;
      }

      assert(false, 'expected revert if called by anyone but the staker');
    });

    it('should revert if the new _stakeReleaseTime is not later than the current stake Release Time', async () => {
      try {
        await ds.extendStakeReleaseTime('1', { from: staker });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        return;
      }

      assert(false, 'expected revert if called by anyone but the staker');
    });

    it('should set the stakeReleaseTime to the _stakeReleaseTime', async () => {
      await ds.extendStakeReleaseTime(conf.deadline + 20, { from: staker });
      const stakeReleaseTime = await ds.stakeReleaseTime();
      assert.strictEqual((conf.deadline + 20).toString(10), stakeReleaseTime.toString(10), 'stakeRelease didnt set correctly');
    });

    it('should emit a ReleaseTimeIncreased event', async () => {
      await ds.extendStakeReleaseTime(conf.deadline + 20, { from: staker }).then((status) => {
        assert.strictEqual('ReleaseTimeIncreased', status.logs[0].event, 'did not emit the ReleaseTimeIncreased event');
      });
    });
  });
});
