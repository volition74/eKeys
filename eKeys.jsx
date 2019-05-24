function AnimGroup(inputKeyframes = []) {
  // More reliable version of standard js typeof
  const getType = value =>
    Object.prototype.toString
      .call(value)
      .replace(/^\[object |\]$/g, '')
      .toLowerCase();

  // Error message template for an incorrect type
  const typeErrorMessage = (variableName, expectedType, receivedType) => {
    throw new TypeError(
      `${variableName} must be of type ${expectedType}. Received ${receivedType}`
    );
  };

  // Error message template for missing required argument
  const requiredArgumentError = (variableName, functionName) => {
    throw new Error(`${variableName} is required in ${functionName}`);
  };

  // Checks if a variable type matches the given expected type
  // expected type can be array of types
  const isValidType = (argumentType, expectedType) => {
    if (getType(expectedType) === 'string') {
      return argumentType === expectedType;
    }
    if (getType(expectedType) === 'array') {
      return expectedType.filter(type => argumentType === type).length > 0;
    }
    return typeErrorMessage(
      'expected type',
      'string or array',
      getType(expectedType)
    );
  };

  // Loops through an array of the format [variable, 'expectedType']
  // and checks if each variable is of the expected type and
  // returns a TypeError if it's not
  const checkTypes = checkingArray => {
    checkingArray.map(check => {
      const argumentType = getType(check[0]);
      const expectedType = check[1];
      if (!isValidType(argumentType, expectedType)) {
        typeErrorMessage(check[0], expectedType, argumentType);
      }
    });
  };

  // Make sure that a given keyframe is valid
  // Sets defaults and checks for errors
  const validateKeyframe = (key, index) => {
    // Set keyframe defaults
    const {
      keyTime = requiredArgumentError('keyTime', `keyframe ${index}`),
      keyValue = requiredArgumentError('keyValue', `keyframe ${index}`),
      easeIn = 33,
      easeOut = 33,
      velocityIn = 0,
      velocityOut = 0,
    } = key;

    // Check data types of keyframe parameters
    checkTypes([
      [keyTime, 'number'],
      [keyValue, ['number', 'array']],
      [easeIn, 'number'],
      [easeOut, 'number'],
      [velocityIn, 'number'],
      [velocityOut, 'number'],
    ]);

    // Return validated keyframe
    const validKey = {
      keyTime,
      keyValue,
      easeIn,
      easeOut,
      velocityIn,
      velocityOut,
    };

    return validKey;
  };

  // Validate and sort the given keys
  const keys = inputKeyframes
    .map((key, index) => validateKeyframe(key, index))
    .sort((a, b) => a.keyTime - b.keyTime);

  // Creates bezier curve and returns function
  // to calculate eased value
  const bezier = (mX1, mY1, mX2, mY2) => {
    /**
     * https://github.com/gre/bezier-easing
     * BezierEasing - use bezier curve for transition easing function
     * by Gaëtan Renaudeau 2014 - 2015 – MIT License
     */

    // These values are established by empiricism with tests (tradeoff: performance VS precision)
    const NEWTON_ITERATIONS = 4;
    const NEWTON_MIN_SLOPE = 0.001;
    const SUBDIVISION_PRECISION = 0.0000001;
    const SUBDIVISION_MAX_ITERATIONS = 10;

    const kSplineTableSize = 11;
    const kSampleStepSize = 1.0 / (kSplineTableSize - 1.0);

    const float32ArraySupported = typeof Float32Array === 'function';

    const A = (aA1, aA2) => 1.0 - 3.0 * aA2 + 3.0 * aA1;
    const B = (aA1, aA2) => 3.0 * aA2 - 6.0 * aA1;
    const C = aA1 => 3.0 * aA1;

    // Returns x(t) given t, x1, and x2, or y(t) given t, y1, and y2.
    const calcBezier = (aT, aA1, aA2) =>
      ((A(aA1, aA2) * aT + B(aA1, aA2)) * aT + C(aA1)) * aT;

    // Returns dx/dt given t, x1, and x2, or dy/dt given t, y1, and y2.
    const getSlope = (aT, aA1, aA2) =>
      3.0 * A(aA1, aA2) * aT * aT + 2.0 * B(aA1, aA2) * aT + C(aA1);

    const binarySubdivide = (aX, aA, aB, mX1, mX2) => {
      let currentX;
      let currentT;
      let i = 0;
      do {
        currentT = aA + (aB - aA) / 2.0;
        currentX = calcBezier(currentT, mX1, mX2) - aX;
        if (currentX > 0.0) {
          aB = currentT;
        } else {
          aA = currentT;
        }
      } while (
        Math.abs(currentX) > SUBDIVISION_PRECISION &&
        ++i < SUBDIVISION_MAX_ITERATIONS
      );
      return currentT;
    };

    const newtonRaphsonIterate = (aX, aGuessT, mX1, mX2) => {
      for (let i = 0; i < NEWTON_ITERATIONS; ++i) {
        const currentSlope = getSlope(aGuessT, mX1, mX2);
        if (currentSlope === 0.0) {
          return aGuessT;
        }
        const currentX = calcBezier(aGuessT, mX1, mX2) - aX;
        aGuessT -= currentX / currentSlope;
      }
      return aGuessT;
    };

    const LinearEasing = x => x;

    if (!(mX1 >= 0 && mX1 <= 1 && mX2 >= 0 && mX2 <= 1)) {
      throw new Error('bezier x values must be in [0, 1] range');
    }

    if (mX1 === mY1 && mX2 === mY2) {
      return LinearEasing;
    }

    // Precompute samples table
    const sampleValues = float32ArraySupported
      ? new Float32Array(kSplineTableSize)
      : new Array(kSplineTableSize);
    for (let i = 0; i < kSplineTableSize; ++i) {
      sampleValues[i] = calcBezier(i * kSampleStepSize, mX1, mX2);
    }

    const getTForX = aX => {
      let intervalStart = 0.0;
      let currentSample = 1;
      const lastSample = kSplineTableSize - 1;

      for (
        ;
        currentSample !== lastSample && sampleValues[currentSample] <= aX;
        ++currentSample
      ) {
        intervalStart += kSampleStepSize;
      }
      --currentSample;

      // Interpolate to provide an initial guess for t
      const dist =
        (aX - sampleValues[currentSample]) /
        (sampleValues[currentSample + 1] - sampleValues[currentSample]);
      const guessForT = intervalStart + dist * kSampleStepSize;
      const initialSlope = getSlope(guessForT, mX1, mX2);

      if (initialSlope >= NEWTON_MIN_SLOPE) {
        return newtonRaphsonIterate(aX, guessForT, mX1, mX2);
      }
      if (initialSlope === 0.0) {
        return guessForT;
      }
      return binarySubdivide(
        aX,
        intervalStart,
        intervalStart + kSampleStepSize,
        mX1,
        mX2
      );
    };

    const bezierEasing = x => {
      if (x === 0) {
        return 0;
      }
      if (x === 1) {
        return 1;
      }
      return calcBezier(getTForX(x), mY1, mY2);
    };

    return bezierEasing;
  };

  // Returns the final animated value
  const animateBetweenKeys = function(
    time = requiredArgumentError('time', '.anim inputs')
  ) {
    checkTypes([[time, 'number']]);
    const lastKeyNum = keys.length - 1;
    const lastKey = keys[lastKeyNum];

    // If outside of all keys, return closest
    // key value, skip animation
    if (time <= keys[0].keyTime) {
      return keys[0].keyValue;
    }
    if (time >= lastKey.keyTime) {
      return lastKey.keyValue;
    }

    // Set current key to most recent keyframe
    let curKeyNum = 0;
    while (curKeyNum < lastKeyNum && time >= keys[curKeyNum + 1].keyTime) {
      curKeyNum++;
    }

    const curKey = keys[curKeyNum];
    const nextKey = keys[curKeyNum + 1];

    // Check to see if no animation is
    // required between current keys
    if (curKey.value === nextKey.value) {
      return curKey.value;
    }

    // Create easing spline based on current and next key
    const easingCurve = bezier(
      curKey.easeOut / 100,
      curKey.velocityOut / 100,
      1 - nextKey.easeIn / 100,
      1 - nextKey.velocityIn / 100
    );

    // Delta calculations
    const deltaT = nextKey.keyTime - curKey.keyTime;

    // Create incrementing time value that is zero
    // at start keyframe time
    const movedTime = Math.max(time - curKey.keyTime, 0);

    // Normalize time input to maximum of one
    // and to correct speed
    const timeInput = Math.min(1, movedTime / deltaT);

    // Get progress value according to easing spline
    const progress = easingCurve(timeInput);

    // Performs animation on each element of array individually
    const animateArrayFromProgress = (startArray, endArray, progressAmount) => {
      // Array Subtraction
      const arrayDelta = endArray.map(
        (item, index) => item - startArray[index]
      );
      // Multiply difference by progress
      const deltaProgressed = arrayDelta.map(item => item * progressAmount);
      // Add to current key and return
      return startArray.map((item, index) => item + deltaProgressed[index]);
    };
    // Animate between values according to progress
    const animateValueFromProgress = (startVal, endVal, progressAmount) => {
      const valueDelta = endVal - startVal;
      return startVal + valueDelta * progressAmount;
    };

    // Return animation according to whether values are an array
    const animateProps = [curKey.keyValue, nextKey.keyValue, progress];
    return Array.isArray(curKey.keyValue) || Array.isArray(nextKey.keyValue)
      ? animateArrayFromProgress(...animateProps)
      : animateValueFromProgress(...animateProps);
  };

  const publicAPI = {
    anim: animateBetweenKeys,
  };

  return publicAPI;
}