/*
Copyright 2014 Google Inc. All rights reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
"use strict";

var CALLSET_TYPE = "CALLSET";
var READSET_TYPE = "READSET";

function toggleUi(clazz, link) {
  $(".toggleable").hide();
  $("." + clazz).show();

  $('#mainNav li').removeClass('active');
  $(link).parent().addClass('active');
}

function showError(message) {
  showAlert(message, 'danger');
}

function showMessage(message) {
  showAlert(message, 'info');
}

function showAlert(message, type) {
  var alert = $('<div class="alert alert-info alert-dismissable"/>')
      .addClass('alert-' + type)
      .text(message).appendTo($("body"));
  closeButton().attr('data-dismiss', 'alert').appendTo(alert);
  alert.css('margin-left', -1 * alert.width()/2);

  setTimeout(function() {
    alert.alert('close');
  }, type == 'danger' ? 5000 : 3000);
}

function assert(condition) {
  if (!condition) {
    console.error('assert failed');
  }
}

function closeButton() {
  return $('<button type="button" class="close" aria-hidden="true">&times;</button>');
}

var loadedSetData = {};
function loadSet(backend, readsetIds, callsetIds, opt_location, setType, id) {
  if (_.has(loadedSetData, id)) {
    return false;
  }

  showMessage('Loading data');

  $.getJSON('/api/sets', {backend: backend, setType: setType, setId: id})
    .done(function(res) {
      var sequenceData = res.contigs || res.fileData[0].refSequences;
      loadedSetData[id] = {id: id, name: res.name, type: setType,
        backend: backend, sequences: sequenceData};
      updateSets(backend, readsetIds, callsetIds, opt_location);
    });
  return true;
}

function updateSets(backend, readsetIds, callsetIds, opt_location) {
  // Load missing readsets
  for (var i = 0; i < readsetIds.length; i++) {
    if (loadSet(backend, readsetIds, callsetIds, opt_location, READSET_TYPE, readsetIds[i])) {
      // Wait for the set to callback
      return;
    }
  }

  // Load missing callsets
  for (var j = 0; j < callsetIds.length; j++) {
    if (loadSet(backend, readsetIds, callsetIds, opt_location, CALLSET_TYPE, callsetIds[j])) {
      // Wait for the set to callback
      return;
    }
  }

  // TODO: Get this data from a better location
  // TODO: Allow data from different backends to be loaded at the same time
  var backendName = $('#backend option[value=' + backend + ']').text().trim();

  updateListItems(backendName, READSET_TYPE, readsetIds, loadedSetData);
  updateListItems(backendName, CALLSET_TYPE, callsetIds, loadedSetData);

  // Update readgraph with new sets
  var setData = _.filter(loadedSetData, function(data) {
    return (_.contains(readsetIds, data.id) && data.type == READSET_TYPE) ||
      (_.contains(callsetIds, data.id) && data.type == CALLSET_TYPE);
  });

  readgraph.updateSets(setData);
  if (setData.length > 0 && opt_location) {
    readgraph.jumpGraph(opt_location);
  }
}

function updateListItems(backendName, setType, ids, loadedSetData) {
  $('#' + setType + 'Title').toggle(ids.length > 0);
  var setList = $('#active' + setType).empty();

  $.each(ids, function(i, id) {
    var name = loadedSetData[id].name;

    var li = $('<li>', {'id': setType + '-' + id, 'class': 'list-group-item'})
      .appendTo(setList);

    closeButton().appendTo(li).click(function() {
      removeSet(id, setType);
      return false;
    });

    var displayName = backendName + ": " + name;
    $('<div/>', {'class': 'setName'}).text(displayName).appendTo(li);
  });
}

function searchSets() {
  var backend = $('#backend').val();
  var datasetSelector = $('#datasetId' + backend);
  var datasetId = datasetSelector.val();
  var supportsCallsets = datasetSelector.attr("supportsCallsets");

  searchSetsOfType(READSET_TYPE, backend, datasetId);
}

function setSearchTab(setType) {
  $('.tab-pane').hide();
  $('.nav-tabs li').removeClass("active");
  $('#' + setType + 'Tab').addClass('active');
  $('#searchPane' + setType).show();
}

var activeSearch;

function searchSetsOfType(setType, backend, datasetId) {
  if (activeSearch) {
    abortingJqXHR = activeSearch;
    activeSearch.abort();
  }

  var div = $('#setSearchResults').html('<img src="static/img/spinner.gif"/>');

  activeSearch = $.getJSON('/api/sets',
    {'backend': backend, 'datasetId': datasetId,
      'setType': setType, 'name': $('#setName').val()})
      .done(function(res, textStatus, jqXHR) {
        if (activeSearch != jqXHR) {
          return;
        }
        div.empty();

        var sets = res.readsets || res.callsets;
        if (!sets) {
          div.html('No data found');
          return;
        }

        $.each(sets, function(i, data) {
          $('<a/>', {'href': '#', 'class': 'list-group-item'})
              .text(data.name).appendTo(div).click(function() {
            switchToSet(backend, setType, data.id);
            return false;
          });
        });

      }).fail(function(jqXHR, textSatus, errorThrown) {
        if (activeSearch == jqXHR) {
          activeSearch = undefined;
          div.empty();
        }
      });
}


// Hash functions
function setAnchor(map) {
  window.location.hash = $.param(map, true);
}

var arrayKeys = ['readsetId', 'callsetId'];
function getAnchorMap() {
  var hashParts = window.location.hash.substring(1).split('&');
  var map = {};
  for (var i = 0; i < hashParts.length; i++) {
    var option = decodeURIComponent(hashParts[i]).split('=');
    var key = option[0];
    var value = option[1];

    if (!_.contains(arrayKeys, key)) {
      map[key] = value;
    } else if (map[key]) {
      map[key].push(value);
    } else {
      map[key] = [value];
    }
  }

  return map;
}

function removeSet(id, setType) {
  var state = getAnchorMap();
  var key = setType == READSET_TYPE ? 'readsetId' : 'callsetId';
  state[key] = _.without(state[key], id);
  if (state[key].length == 0) {
    delete state[key];
  }
  setAnchor(state);
}

function switchToSet(backend, setType, id) {
  var state = getAnchorMap();
  var key = setType == READSET_TYPE ? 'readsetId' : 'callsetId';

  if (setType == READSET_TYPE) {
    state[key] = [id];
  } else {
    state[key] = (state[key] || []);
    state[key].push(id);
  }

  // TODO: Support multiple backends at once
  state.backend = backend;
  setAnchor(state);
}

function switchToLocation(location) {
  var state = _.extend(getAnchorMap(), {'location': location});
  setAnchor(state);
}

function updateUserLocation(location) {
  switchToLocation(readgraph.jumpGraph(location));
}

function handleHash() {
  var state = getAnchorMap();

  if (state.backend && state.readsetId) {
    $('#setSearch').hide();

    updateSets(state.backend, (state.readsetId || []).slice(0, 1),
      state.callsetId || [], state.location);
    if (state.location) {
      // Strip off the chromosome prefix
      var colonIndex = state.location.indexOf(":");
      var location = state.location.substring(colonIndex + 1);
      $("#readsetPosition").val(location);
    }
  } else {
    // Ensure the right datasets are listed and kick off a search.
    $('#backend').change();
    $('#setSearch').show();
  }
}

var abortingJqXHR;

// Show the about popup when the page loads the first time, read the hash,
// and prep the initial set search
$(document).ready(function() {
  if (!sessionStorage.getItem('about-shown')) {
    sessionStorage.setItem('about-shown', true);
    $('#about').modal('show');
  }

  $(document).ajaxError(function(e, xhr) {
    if (xhr == abortingJqXHR) {
      return;
    }
    showError('Sorry, the api request failed for some reason. ' +
        '(' + xhr.responseText + ')');
  });

  $(window).on('hashchange', handleHash);

  // Initialize search UI from local storage.
  if (!localStorage.lastBackend) {
    localStorage.lastBackend = 'GOOGLE';
  }
  if (!localStorage.lastDataset) {
    localStorage.lastDataset = '{}';
  }
  $('#backend').val(localStorage.lastBackend);
  $.each(JSON.parse(localStorage.lastDataset), function(backend, dataset) {
    var selector = $('#datasetId' + backend);
    if (selector) {
      selector.val(dataset);
    };
  });

  // Register handlers for search UI field changes.
  $('.datasetSelector').change(function() {
    var ld = JSON.parse(localStorage.lastDataset);
    ld[$('#backend').val()] = $(this).val();
    localStorage.lastDataset = JSON.stringify(ld);
    searchSets();
  });
  $('#setName').change(searchSets);
  $('#backend').change(function() {
    localStorage.lastBackend = $(this).val();
    $('.datasetSelector').hide();
    $('#datasetId' + $(this).val()).show();
    searchSets();
  });

  handleHash();
});