// ═══════════════════════════════════════════════════════════════════════════════
// xCALLY Calls Helper — Save call records to xcally_calls_logs table
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Save individual call records to the xcally_calls_logs table
 * This function is designed to be called during the xCALLY import process
 * 
 * @param {Array} callRecords - Array of call record objects to save
 * @param {Object} db - Supabase database client instance
 * @returns {Promise<Object>} Result object with success status and message
 */
async function saveCallRecords(callRecords, db) {
  if (!callRecords || !callRecords.length) {
    return { success: false, message: 'No call records to save' };
  }

  try {
    // Prepare records for insertion
    const recordsToInsert = callRecords.map(record => ({
      call_date: record.call_date || new Date().toISOString().split('T')[0],
      call_time: record.call_time || new Date().toTimeString().split(' ')[0],
      agent_id: record.agent_id || null,
      agent_name: record.agent_name || '',
      customer_name: record.customer_name || null,
      customer_mobile: record.customer_mobile || null,
      call_reason: record.call_reason || null,
      call_source: record.call_source || 'inbound', // 'inbound' or 'outbound'
      call_channel: record.call_channel || 'phone', // 'phone' or 'whatsapp'
      call_duration: record.call_duration || 0, // in seconds
      talk_duration: record.talk_duration || 0, // in seconds
      media_url: record.media_url || null,
      event_type: record.event_type || null,
      raw_data: record.raw_data || null,
    }));

    // Insert records in batches of 100
    for (let i = 0; i < recordsToInsert.length; i += 100) {
      const batch = recordsToInsert.slice(i, i + 100);
      const { error } = await db.from('xcally_calls_logs').insert(batch);
      
      if (error) {
        console.error('Error inserting batch:', error);
        throw error;
      }
    }

    return {
      success: true,
      message: `Successfully saved ${recordsToInsert.length} call record(s)`,
      count: recordsToInsert.length,
    };

  } catch (error) {
    console.error('Error saving call records:', error);
    return {
      success: false,
      message: `Failed to save call records: ${error.message}`,
      error: error,
    };
  }
}

/**
 * Extract call data from xCALLY CSV data
 * Parses the raw xCALLY report and extracts individual call records
 * 
 * @param {Object} dayData - Day data object from xCALLY import (keyed by agent name)
 * @param {String} date - The date of the calls (YYYY-MM-DD format)
 * @param {Array} allAgents - Array of agent objects with id and formal_name
 * @returns {Array} Array of call record objects
 */
function extractCallRecords(dayData, date, allAgents) {
  const callRecords = [];

  Object.entries(dayData).forEach(([agentName, agentData]) => {
    // Find agent by name
    const normalize = s => (s || '').toLowerCase().replace(/\s+/g, '');
    const agent = allAgents.find(a =>
      normalize(a.xcally_name) === normalize(agentName) ||
      normalize(a.formal_name) === normalize(agentName)
    );

    // Extract individual calls from the agent's data
    if (agentData.calls && agentData.calls.length) {
      agentData.calls.forEach(call => {
        callRecords.push({
          call_date: date,
          call_time: call.time || '00:00:00',
          agent_id: agent?.id || null,
          agent_name: agent?.formal_name || agentName,
          customer_name: call.customer_name || null,
          customer_mobile: call.customer_mobile || null,
          call_reason: call.reason || null,
          call_source: call.source || 'inbound',
          call_channel: call.channel || 'phone',
          call_duration: call.duration || 0,
          talk_duration: call.talk_duration || 0,
          media_url: call.recording_url || null,
          event_type: call.event_type || 'inbound',
          raw_data: call.raw_data || null,
        });
      });
    }
  });

  return callRecords;
}

/**
 * Batch upsert call records (insert or update if exists)
 * Uses a unique constraint on (agent_id, call_date, call_time, customer_mobile) to determine duplicates
 * 
 * @param {Array} callRecords - Array of call record objects to upsert
 * @param {Object} db - Supabase database client instance
 * @returns {Promise<Object>} Result object with success status and message
 */
async function upsertCallRecords(callRecords, db) {
  if (!callRecords || !callRecords.length) {
    return { success: false, message: 'No call records to upsert' };
  }

  try {
    // Upsert records in batches of 100
    for (let i = 0; i < callRecords.length; i += 100) {
      const batch = callRecords.slice(i, i + 100);
      const { error } = await db.from('xcally_calls_logs').upsert(batch, {
        onConflict: 'agent_id,call_date,call_time,customer_mobile',
      });
      
      if (error) {
        console.error('Error upserting batch:', error);
        throw error;
      }
    }

    return {
      success: true,
      message: `Successfully upserted ${callRecords.length} call record(s)`,
      count: callRecords.length,
    };

  } catch (error) {
    console.error('Error upserting call records:', error);
    return {
      success: false,
      message: `Failed to upsert call records: ${error.message}`,
      error: error,
    };
  }
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    saveCallRecords,
    extractCallRecords,
    upsertCallRecords,
  };
}
