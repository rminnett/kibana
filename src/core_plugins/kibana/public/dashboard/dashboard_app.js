/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { uiModules } from 'ui/modules';
import chrome from 'ui/chrome';
import { applyTheme } from 'ui/theme';

import 'ui/query_bar';

import { panelActionsStore } from './store/panel_actions_store';

import { getDashboardTitle } from './dashboard_strings';
import { TopNavIds } from './top_nav/top_nav_ids';
import { FilterBarQueryFilterProvider } from 'ui/filter_bar/query_filter';
import { DocTitleProvider } from 'ui/doc_title';
import { getTopNavConfig } from './top_nav/get_top_nav_config';
import { DashboardConstants } from './dashboard_constants';
import { DashboardStateManager } from './dashboard_state_manager';
import { migrateLegacyQuery } from 'ui/utils/migrateLegacyQuery';
import * as filterActions from 'ui/doc_table/actions/filter';
import { FilterManagerProvider } from 'ui/filter_manager';
import { EmbeddableFactoriesRegistryProvider } from 'ui/embeddable/embeddable_factories_registry';
import { DashboardPanelActionsRegistryProvider } from 'ui/dashboard_panel_actions/dashboard_panel_actions_registry';
import { timefilter } from 'ui/timefilter';

import { DashboardViewportProvider } from './viewport/dashboard_viewport_provider';

const app = uiModules.get('app/dashboard', [
  'elasticsearch',
  'ngRoute',
  'react',
  'kibana/courier',
  'kibana/config',
  'kibana/typeahead',
]);

app.directive('dashboardViewportProvider', function (reactDirective) {
  return reactDirective(DashboardViewportProvider);
});

app.directive('dashboardApp', function ($injector) {
  const courier = $injector.get('courier');
  const AppState = $injector.get('AppState');
  const kbnUrl = $injector.get('kbnUrl');
  const config = $injector.get('config');
  const Private = $injector.get('Private');

  return {
    restrict: 'E',
    controllerAs: 'dashboardApp',
    controller: function ($scope, $rootScope, $route, $routeParams, $location, getAppState, dashboardConfig, localStorage) {
      const filterManager = Private(FilterManagerProvider);
      const filterBar = Private(FilterBarQueryFilterProvider);
      const docTitle = Private(DocTitleProvider);
      const embeddableFactories = Private(EmbeddableFactoriesRegistryProvider);
      const panelActionsRegistry = Private(DashboardPanelActionsRegistryProvider);

      panelActionsStore.initializeFromRegistry(panelActionsRegistry);

      $scope.getEmbeddableFactory = panelType => embeddableFactories.byName[panelType];

      const dash = $scope.dash = $route.current.locals.dash;
      if (dash.id) {
        docTitle.change(dash.title);
      }

      const dashboardStateManager = new DashboardStateManager({
        savedDashboard: dash,
        AppState,
        hideWriteControls: true, //dashboardConfig.getHideWriteControls(),
        addFilter: ({ field, value, operator, index }) => {
          filterActions.addFilter(field, value, operator, index, dashboardStateManager.getAppState(), filterManager);
        }
      });

      $scope.getDashboardState = () => dashboardStateManager;
      $scope.appState = dashboardStateManager.getAppState();

      // The 'previouslyStored' check is so we only update the time filter on dashboard open, not during
      // normal cross app navigation.
      if (dashboardStateManager.getIsTimeSavedWithDashboard() && !getAppState.previouslyStored()) {
        dashboardStateManager.syncTimefilterWithDashboard(timefilter, config.get('timepicker:quickRanges'));
      }

      const updateState = () => {
        // Following the "best practice" of always have a '.' in your ng-models –
        // https://github.com/angular/angular.js/wiki/Understanding-Scopes
        $scope.model = {
          query: dashboardStateManager.getQuery(),
          useMargins: dashboardStateManager.getUseMargins(),
          hidePanelTitles: dashboardStateManager.getHidePanelTitles(),
          darkTheme: dashboardStateManager.getDarkTheme(),
          timeRestore: dashboardStateManager.getTimeRestore(),
          title: dashboardStateManager.getTitle(),
          description: dashboardStateManager.getDescription(),
        };
        $scope.panels = dashboardStateManager.getPanels();
        $scope.indexPatterns = dashboardStateManager.getPanelIndexPatterns();
      };

      // Part of the exposed plugin API - do not remove without careful consideration.
      this.appStatus = {
        dirty: !dash.id
      };

      this.getSharingTitle = () => {
        return dash.title;
      };

      this.getSharingType = () => {
        return 'dashboard';
      };

      dashboardStateManager.registerChangeListener(status => {
        this.appStatus.dirty = status.dirty || !dash.id;
        updateState();
      });

      dashboardStateManager.applyFilters(
        dashboardStateManager.getQuery() || {
          query: '',
          language: localStorage.get('kibana.userQueryLanguage') || config.get('search:queryLanguage')
        },
        filterBar.getFilters()
      );

      timefilter.enableAutoRefreshSelector();
      timefilter.enableTimeRangeSelector();

      updateState();

      $scope.refresh = () => {
        $rootScope.$broadcast('fetch');
        courier.fetch();
      };
      dashboardStateManager.handleTimeChange(timefilter.getTime());

      $scope.expandedPanel = null;
      $scope.dashboardViewMode = dashboardStateManager.getViewMode();

      $scope.landingPageUrl = () => `#${DashboardConstants.LANDING_PAGE_PATH}`;
      $scope.hasExpandedPanel = () => $scope.expandedPanel !== null;
      $scope.getDashTitle = () => getDashboardTitle(
        dashboardStateManager.getTitle(),
        dashboardStateManager.getViewMode(),
        dashboardStateManager.getIsDirty(timefilter));
      $scope.newDashboard = () => { kbnUrl.change(DashboardConstants.CREATE_NEW_DASHBOARD_URL, {}); };
      $scope.saveState = () => dashboardStateManager.saveState();
      $scope.getShouldShowEditHelp = () => (
        !dashboardStateManager.getPanels().length &&
        dashboardStateManager.getIsEditMode() &&
        !dashboardConfig.getHideWriteControls()
      );
      $scope.getShouldShowViewHelp = () => (
        !dashboardStateManager.getPanels().length &&
        dashboardStateManager.getIsViewMode() &&
        !dashboardConfig.getHideWriteControls()
      );

      $scope.minimizeExpandedPanel = () => {
        $scope.expandedPanel = null;
      };

      $scope.expandPanel = (panelIndex) => {
        $scope.expandedPanel =
            dashboardStateManager.getPanels().find((panel) => panel.panelIndex === panelIndex);
      };

      $scope.updateQueryAndFetch = function (query) {
        $scope.model.query = migrateLegacyQuery(query);
        dashboardStateManager.applyFilters($scope.model.query, filterBar.getFilters());
        $scope.refresh();
      };

      $scope.$watch('model.hidePanelTitles', () => {
        dashboardStateManager.setHidePanelTitles($scope.model.hidePanelTitles);
      });
      $scope.$watch('model.useMargins', () => {
        dashboardStateManager.setUseMargins($scope.model.useMargins);
      });
      $scope.$watch('model.darkTheme', () => {
        dashboardStateManager.setDarkTheme($scope.model.darkTheme);
        updateTheme();
      });
      $scope.indexPatterns = [];

      $scope.onPanelRemoved = (panelIndex) => {
        dashboardStateManager.removePanel(panelIndex);
        $scope.indexPatterns = dashboardStateManager.getPanelIndexPatterns();
      };

      $scope.$watch('model.query', $scope.updateQueryAndFetch);

      $scope.$listenAndDigestAsync(timefilter, 'fetch', () => {
        dashboardStateManager.handleTimeChange(timefilter.getTime());
        // Currently discover relies on this logic to re-fetch. We need to refactor it to rely instead on the
        // directly passed down time filter. Then we can get rid of this reliance on scope broadcasts.
        $scope.refresh();
      });

      function updateViewMode(newMode) {
        $scope.topNavMenu = getTopNavConfig(newMode, navActions, dashboardConfig.getHideWriteControls()); // eslint-disable-line no-use-before-define
        dashboardStateManager.switchViewMode(newMode);
        $scope.dashboardViewMode = newMode;
      }

      $scope.showFilterBar = () => filterBar.getFilters().length > 0 || !dashboardStateManager.getFullScreenMode();

      $scope.showAddPanel = () => {
        dashboardStateManager.setFullScreenMode(false);
        $scope.kbnTopNav.click(TopNavIds.ADD);
      };
      $scope.enterEditMode = () => {
        dashboardStateManager.setFullScreenMode(false);
        $scope.kbnTopNav.click('edit');
      };
      const navActions = {};
      updateViewMode(dashboardStateManager.getViewMode());

      // update root source when filters update
      $scope.$listen(filterBar, 'update', function () {
        dashboardStateManager.applyFilters($scope.model.query, filterBar.getFilters());
      });

      // update data when filters fire fetch event
      $scope.$listen(filterBar, 'fetch', $scope.refresh);

      $scope.$on('$destroy', () => {
        dashboardStateManager.destroy();

        // Remove dark theme to keep it from affecting the appearance of other apps.
        setLightTheme();
      });

      function updateTheme() {
        dashboardStateManager.getDarkTheme() ? setDarkTheme() : setLightTheme();
      }

      function setDarkTheme() {
        chrome.removeApplicationClass(['theme-light']);
        chrome.addApplicationClass('theme-dark');
        applyTheme('dark');
      }

      function setLightTheme() {
        chrome.removeApplicationClass(['theme-dark']);
        chrome.addApplicationClass('theme-light');
        applyTheme('light');
      }

      if ($route.current.params && $route.current.params[DashboardConstants.NEW_VISUALIZATION_ID_PARAM]) {
        dashboardStateManager.addNewPanel($route.current.params[DashboardConstants.NEW_VISUALIZATION_ID_PARAM], 'visualization');

        kbnUrl.removeParam(DashboardConstants.ADD_VISUALIZATION_TO_DASHBOARD_MODE_PARAM);
        kbnUrl.removeParam(DashboardConstants.NEW_VISUALIZATION_ID_PARAM);
      }

      // TODO remove opts once share has been converted to react
      $scope.opts = {
        dashboard: dash, // used in share.html
      };
    }
  };
});
