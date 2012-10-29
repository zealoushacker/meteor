(function () {

  // This is reactive.
  Meteor.userId = function () {
    return Meteor.default_connection.userId();
  };

  // XXX expose "is logging in" state instead of "is loaded" state

  // XXX get rid of this?
  Meteor.userLoaded = function () {
    return !!Meteor.userId();
  };

  // This calls userId, which is reactive.
  Meteor.user = function () {
    var userId = Meteor.userId();
    if (!userId)
      return null;
    var user = Meteor.users.findOne(userId);
    if (user) return user;

    // For some reason this user has no published fields (and thus is considered
    // to not exist in minimongo). Return a minimal object.
    return {_id: userId};
  };

  // XXX doc. make it clear what a login method is (ie, it should on success
  //     setUserId and return {token,id})
  Accounts.callLoginMethod = function (options) {
    options = _.extend({
      methodName: 'login',
      methodArguments: [],
      acceptResult: function () { },
      // XXX not sure about the name here. 'callback'? or just take it
      //     out of the options object?
      userCallback: function () { }
    }, options);
    // XXX can we have a more general pattern for "call this function once we
    //     have both result and data"? we are NOT going to guarantee that data
    //     always comes after result.
    var gotData = false;
    var gotResult = false;
    var savedResult;
    var maybeMakeClientLoggedIn = function () {
      if (gotData && gotResult) {
        // We have both the data and the result. Make the client logged in ---
        // and the user is already loaded!
        Accounts._makeClientLoggedIn(savedResult.id, savedResult.token);
        options.userCallback();
      }
    };
    Meteor.apply(
      options.methodName, options.methodArguments, {
        wait: true,
        onDataReady: function () {
          gotData = true;
          maybeMakeClientLoggedIn();
        }},
      function (error, result) {
        if (error || !result) {
          error = error || new Error(
            "No result from call to " + options.methodName);
          options.userCallback(error);
          return;
        }
        try {
          options.acceptResult(result);
        } catch (e) {
          options.userCallback(e);
          return;
        }
        gotResult = true;
        savedResult = result;
        maybeMakeClientLoggedIn();
      });
  };

  Accounts._makeClientLoggedOut = function() {
    Accounts._unstoreLoginToken();
    Meteor.default_connection.setUserId(null);
    Meteor.default_connection.onReconnect = null;
  };

  Accounts._makeClientLoggedIn = function(userId, token) {
    Accounts._storeLoginToken(userId, token);
    Meteor.default_connection.setUserId(userId);
    Meteor.default_connection.onReconnect = function() {
      Meteor.apply('login', [{resume: token}], {wait: true}, function(error, result) {
        if (error) {
          Accounts._makeClientLoggedOut();
          throw error;
        } else {
          // nothing to do
        }
      });
    };
  };

  Meteor.logout = function (callback) {
    Meteor.apply('logout', [], {wait: true}, function(error, result) {
      if (error) {
        callback && callback(error);
      } else {
        Accounts._makeClientLoggedOut();
        callback && callback();
      }
    });
  };

  // If we're using Handlebars, register the {{currentUser}} and
  // {{currentUserLoaded}} global helpers.
  if (typeof Handlebars !== 'undefined') {
    Handlebars.registerHelper('currentUser', function () {
      return Meteor.user();
    });
    Handlebars.registerHelper('currentUserLoaded', function () {
      return Meteor.userLoaded();
    });
  }

  // XXX this can be simplified if we merge in
  // https://github.com/meteor/meteor/pull/273
  var loginServicesConfigured = false;
  var loginServicesConfiguredListeners = new Meteor.deps._ContextSet;
  Meteor.subscribe("meteor.loginServiceConfiguration", function () {
    loginServicesConfigured = true;
    loginServicesConfiguredListeners.invalidateAll();
  });

  // A reactive function returning whether the
  // loginServiceConfiguration subscription is ready. Used by
  // accounts-ui to hide the login button until we have all the
  // configuration loaded
  Accounts.loginServicesConfigured = function () {
    if (loginServicesConfigured)
      return true;

    // not yet complete, save the context for invalidation once we are.
    loginServicesConfiguredListeners.addCurrentContext();
    return false;
  };
})();
