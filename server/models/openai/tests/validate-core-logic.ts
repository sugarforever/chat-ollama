#!/usr/bin/env tsx

// Simple test utility functions
function assert(condition: any, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual(actual: any, expected: any, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error("Expected:", expected);
    console.error("Actual:", actual);
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Extracted core logic from our implementation
function processImagesField(delta: any): any {
  let content = delta.content ?? "";

  // Handle images field that might contain image_url content
  if (delta.images && Array.isArray(delta.images)) {
    // Convert content to array format if it's a string and there are images
    if (typeof content === "string") {
      const contentArray = [];
      if (content) {
        contentArray.push({ type: "text", text: content });
      }
      // Add image content from the images field
      for (const image of delta.images) {
        if (image.type === "image_url" && image.image_url) {
          contentArray.push({
            type: "image_url",
            image_url: image.image_url,
          });
        }
      }
      content = contentArray;
    }
  }

  return content;
}

async function runTests() {
  console.log("Starting core image URL parsing logic validation tests...\n");

  // Test 1: Handle text with single image
  console.log("Test 1: Single image with text");
  {
    const mockDelta = {
      content: "Here is an image: ",
      images: [
        {
          type: "image_url",
          image_url: {
            url: "data:image/png;base64,iVBORw0KGgo...",
            detail: "high"
          }
        }
      ]
    };

    const result = processImagesField(mockDelta);

    assert(Array.isArray(result), "Content should be an array");
    assertEqual(result.length, 2, "Content should have 2 items");
    assertEqual(
      result[0],
      { type: "text", text: "Here is an image: " },
      "First item should be text content"
    );
    assertEqual(
      result[1],
      {
        type: "image_url",
        image_url: {
          url: "data:image/png;base64,iVBORw0KGgo...",
          detail: "high"
        }
      },
      "Second item should be image content"
    );
    console.log("✓ PASSED\n");
  }

  // Test 2: Handle multiple images
  console.log("Test 2: Multiple images with text");
  {
    const mockDelta = {
      content: "Multiple images: ",
      images: [
        {
          type: "image_url",
          image_url: { url: "data:image/png;base64,image1..." }
        },
        {
          type: "image_url",
          image_url: { url: "data:image/jpeg;base64,image2..." }
        }
      ]
    };

    const result = processImagesField(mockDelta);

    assert(Array.isArray(result), "Content should be an array");
    assertEqual(result.length, 3, "Content should have 3 items");
    assertEqual(
      result[0],
      { type: "text", text: "Multiple images: " },
      "First item should be text content"
    );
    assertEqual(
      result[1],
      { type: "image_url", image_url: { url: "data:image/png;base64,image1..." } },
      "Second item should be first image"
    );
    assertEqual(
      result[2],
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,image2..." } },
      "Third item should be second image"
    );
    console.log("✓ PASSED\n");
  }

  // Test 3: Handle images only (empty content)
  console.log("Test 3: Images only (empty content)");
  {
    const mockDelta = {
      content: "",
      images: [
        {
          type: "image_url",
          image_url: { url: "data:image/jpeg;base64,onlyimage..." }
        }
      ]
    };

    const result = processImagesField(mockDelta);

    assert(Array.isArray(result), "Content should be an array");
    assertEqual(result.length, 1, "Content should have 1 item");
    assertEqual(
      result[0],
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,onlyimage..." } },
      "Item should be image content only"
    );
    console.log("✓ PASSED\n");
  }

  // Test 4: Maintain backward compatibility for responses without images
  console.log("Test 4: Backward compatibility - responses without images");
  {
    const mockDelta = {
      content: "Just text response"
    };

    const result = processImagesField(mockDelta);

    assertEqual(typeof result, "string", "Content should be a string");
    assertEqual(result, "Just text response", "Content should match original text");
    console.log("✓ PASSED\n");
  }

  // Test 5: Handle invalid image objects gracefully
  console.log("Test 5: Handle invalid image objects gracefully");
  {
    const mockDelta = {
      content: "Text with invalid image: ",
      images: [
        {
          type: "invalid_type",
          image_url: { url: "data:image/png;base64,invalid..." }
        },
        {
          type: "image_url",
          // Missing image_url field
        },
        {
          type: "image_url",
          image_url: { url: "data:image/png;base64,valid..." }
        }
      ]
    };

    const result = processImagesField(mockDelta);

    assert(Array.isArray(result), "Content should be an array");
    assertEqual(result.length, 2, "Content should have 2 items (text + valid image only)");
    assertEqual(
      result[0],
      { type: "text", text: "Text with invalid image: " },
      "First item should be text content"
    );
    assertEqual(
      result[1],
      { type: "image_url", image_url: { url: "data:image/png;base64,valid..." } },
      "Second item should be valid image only"
    );
    console.log("✓ PASSED\n");
  }

  // Test 6: Handle empty images array
  console.log("Test 6: Handle empty images array");
  {
    const mockDelta = {
      content: "Text with empty images array",
      images: []
    };

    const result = processImagesField(mockDelta);

    assert(Array.isArray(result), "Content should be an array");
    assertEqual(result.length, 1, "Content should have 1 item");
    assertEqual(
      result[0],
      { type: "text", text: "Text with empty images array" },
      "Item should be text content only"
    );
    console.log("✓ PASSED\n");
  }

  // Test 7: Handle non-array images field
  console.log("Test 7: Handle non-array images field");
  {
    const mockDelta = {
      content: "Text with invalid images field",
      images: "not an array"
    };

    const result = processImagesField(mockDelta);

    assertEqual(typeof result, "string", "Content should be a string");
    assertEqual(result, "Text with invalid images field", "Content should match original text");
    console.log("✓ PASSED\n");
  }

  // Test 8: Handle null/undefined content with images
  console.log("Test 8: Handle null/undefined content with images");
  {
    const mockDelta = {
      content: null,
      images: [
        {
          type: "image_url",
          image_url: { url: "data:image/png;base64,test..." }
        }
      ]
    };

    const result = processImagesField(mockDelta);

    assert(Array.isArray(result), "Content should be an array");
    assertEqual(result.length, 1, "Content should have 1 item");
    assertEqual(
      result[0],
      { type: "image_url", image_url: { url: "data:image/png;base64,test..." } },
      "Item should be image content only"
    );
    console.log("✓ PASSED\n");
  }

  console.log("🎉 All core logic tests passed! Image URL parsing implementation is working correctly.");
}

// Run the tests
runTests().catch((error) => {
  console.error("❌ Tests failed:", error.message);
  process.exit(1);
});
