/* eslint-env mocha */
/* global contract  */

contract('DelphiStake', (accounts) => {// eslint-disable-line
  describe('Function: extendStakeReleaseTime', () => {
    it('should revert if called by anyone but the staker');
    it('should revert if the new _stakeReleaseTime is not later than the current stake Release Time');
    it('should set the stakeReleaseTime to the _stakeReleaseTime');
    it('should emit a ReleaseTimeIncreased event');
  });
});
