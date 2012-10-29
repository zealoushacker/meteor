// Like Meteor._runTests, but runs the tests on both the client and
// the server. Sets a 'server' flag on test results that came from the
// server.
Meteor._runTestsEverywhere = function (onReport, onComplete) {
  var runId = LocalCollection.uuid();
  var localComplete = false;
  var remoteComplete = false;
  var done = false;

  var maybeDone = function () {
    if (!done && localComplete && remoteComplete) {
      done = true;
      onComplete && onComplete();
    }
  };

  Meteor._runTests(onReport, function () {
    localComplete = true;
    maybeDone();
  });

  var onDataReady = function () {
    // and of course we shouldn't print "All tests pass!"
    // until we have actually received the test results :)
    remoteComplete = true;
    maybeDone();
  };

  Meteor.apply('tinytest/run', [runId], {onDataReady: onDataReady},
               function (error, result) {
                 if (error)
                   // XXX better report error
                   throw new Error("Test server returned an error");
               });

  Meteor.subscribe(Meteor._ServerTestResultsSubscription, runId);
  Meteor.default_connection.registerStore(Meteor._ServerTestResultsCollection, {
    update: function (msg) {
      // We only should call _runTestsEverywhere once per client-page-load, so
      // we really only should see one runId here.
      if (msg.id !== runId)
        return;
      _.each(msg.set, function (report) {
        _.each(report.events, function (event) {
          delete event.cookie; // can't debug a server test on the client..
        });
        report.server = true;
        onReport(report);
      });
    },
    beginUpdate: function () {},
    endUpdate: function () {},
    reset: function () {}});
};
