/* eslint-env mocha */
/* global contract artifacts assert */

const LookupTable = artifacts.require('LookupTable.sol');

/*
 * Decaying values for DV = 5...
 * 0 = 20
 * 1 = 16
 * 2 = 12
 * 3 = 10
 */

contract('LookupTable', () => {
  describe('Function: getGuaranteedPercentageForIndex', () => {
    const DV = '5';
    let lt;

    beforeEach(async () => {
      lt = await LookupTable.new(DV);
    });

    it('should compute lt[0] = 20', async () => {
      const lt0 = await lt.getGuaranteedPercentageForIndex.call('0');

      assert.strictEqual(lt0.toString(), '20', 'A LookupTable instantiated with a decay value of '
        + 'five should have an lt[0] of 20');
    });

    it('should compute lt[1] = 16', async () => {
      const lt1 = await lt.getGuaranteedPercentageForIndex.call('1');

      assert.strictEqual(lt1.toString(), '16', 'A LookupTable instantiated with a decay value of '
        + 'five should have an lt[1] of 16');
    });

    it('should compute lt[2] = 12', async () => {
      const lt2 = await lt.getGuaranteedPercentageForIndex.call('2');

      assert.strictEqual(lt2.toString(), '12', 'A LookupTable instantiated with a decay value of '
        + 'five should have an lt[2] of 12');
    });

    it('should compute lt[3] = 10', async () => {
      const lt3 = await lt.getGuaranteedPercentageForIndex.call('3');

      assert.strictEqual(lt3.toString(), '10', 'A LookupTable instantiated with a decay value of '
        + 'five should have an lt[3] of 10');
    });
  });
});

